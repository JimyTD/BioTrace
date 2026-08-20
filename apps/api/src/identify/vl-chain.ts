/**
 * TokenHub 视觉模型优先级链（与稀有度文本链同一把 Key，只换模型名）。
 * 限流/抖动就地重试；配额耗尽或鉴权失败打冷却降下一档。记下真正出货的模型名。
 */
import { readFile } from "node:fs/promises";
import { fetch as undiciFetch } from "undici";
import { env } from "../env.js";
import {
  classifyTokenhubError,
  tokenhubCoolMsFor,
  tokenhubDirectAgent,
} from "../llm/tokenhub.js";
import type { ErrorKind } from "./health.js";
import { chatCompletionsUrl, contentToText } from "./openai-compatible.js";
import { buildIdentifyPrompt, extractIdentifyJson } from "./prompt.js";
import type { IdentifyInput, IdentifyResult } from "./types.js";

export type VlChainResult = { result: IdentifyResult; model: string };

type ModelHealth = {
  coolUntil: number | null;
  lastError: string | null;
  lastErrorKind: ErrorKind | null;
  lastOkAt: number | null;
};

type VlQuirks = { temperature: number; sendThinking: boolean };

/**
 * 各模型的请求差异：不迁就就是整档 400，白白降级。
 * 没登记的走默认（temperature 0.1、不发 thinking）。
 */
const MODEL_QUIRKS: Record<string, VlQuirks> = {
  // 默认开思考；不显式关掉会先烧思维链，JSON 也不稳。
  "glm-5v-turbo": { temperature: 0.1, sendThinking: true },
  // 非思考模式只接受 0.6。
  "kimi-k2.6": { temperature: 0.6, sendThinking: true },
  "hy-vision-2.0-instruct": { temperature: 0.1, sendThinking: false },
};

const health = new Map<string, ModelHealth>();

function healthOf(model: string): ModelHealth {
  let h = health.get(model);
  if (!h) {
    h = { coolUntil: null, lastError: null, lastErrorKind: null, lastOkAt: null };
    health.set(model, h);
  }
  return h;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function imageDataUrl(mimeType: string, bytes: Buffer): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function quirksOf(model: string): VlQuirks {
  return MODEL_QUIRKS[model] ?? { temperature: 0.1, sendThinking: false };
}

/** 单次 TokenHub 视觉 chat.completions，返回助手文本。 */
export async function callVlModel(
  model: string,
  text: string,
  imageUrl: string,
): Promise<string> {
  if (!env.tokenhubApiKey) throw new Error("TOKENHUB_API_KEY is not set");
  const quirks = quirksOf(model);
  const payload: Record<string, unknown> = {
    model,
    temperature: quirks.temperature,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  };
  if (quirks.sendThinking) {
    payload.thinking = { type: "disabled" };
  }
  const res = await undiciFetch(chatCompletionsUrl(env.tokenhubBaseUrl), {
    dispatcher: tokenhubDirectAgent(),
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.tokenhubApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`TokenHub HTTP ${res.status} (${model}): ${body.slice(0, 300)}`);
  const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string | unknown } }> };
  const content = contentToText(data.choices?.[0]?.message?.content);
  if (!content.trim()) throw new Error(`empty content (${model})`);
  return content;
}

/**
 * 沿链取第一个能出货的视觉模型。全链都不可用时抛 `vl_model_unavailable`。
 */
export async function identifyWithVlChain(
  input: IdentifyInput,
  opts?: { attemptsPerModel?: number },
): Promise<VlChainResult> {
  const attempts = Math.max(1, opts?.attemptsPerModel ?? 3);
  const now = () => Date.now();
  let lastError: string | null = null;
  const bytes = await readFile(input.imagePath);
  const imageUrl = imageDataUrl(input.mimeType, bytes);
  const prompt = buildIdentifyPrompt(input);

  for (const model of env.identifyVlModels) {
    const h = healthOf(model);
    if (h.coolUntil != null && h.coolUntil > now()) continue;

    for (let i = 1; i <= attempts; i++) {
      try {
        const text = await callVlModel(model, prompt, imageUrl);
        const result = extractIdentifyJson(text);
        health.set(model, {
          coolUntil: null,
          lastError: null,
          lastErrorKind: null,
          lastOkAt: now(),
        });
        return { result, model };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const kind = classifyTokenhubError(message);
        lastError = message;
        const retryable = kind === "rate_limited" || kind === "transient";
        if (!retryable || i === attempts) {
          health.set(model, {
            coolUntil: now() + tokenhubCoolMsFor(kind, message),
            lastError: message.slice(0, 400),
            lastErrorKind: kind,
            lastOkAt: h.lastOkAt,
          });
          console.warn(`[identify] VL ${model} ${kind}, 降级下一档: ${message.slice(0, 160)}`);
          break;
        }
        await sleep(Math.min(30_000, kind === "rate_limited" ? tokenhubCoolMsFor(kind, message) : 2_000 * i));
      }
    }
  }

  throw new Error(`vl_model_unavailable${lastError ? `: ${lastError.slice(0, 200)}` : ""}`);
}

export function vlChainReady(): boolean {
  if (!env.tokenhubApiKey) return false;
  const now = Date.now();
  return env.identifyVlModels.some((model) => {
    const h = healthOf(model);
    return h.coolUntil == null || h.coolUntil <= now;
  });
}

export function vlChainSoonestCoolMs(): number {
  const now = Date.now();
  let soonest = Number.POSITIVE_INFINITY;
  for (const model of env.identifyVlModels) {
    const h = healthOf(model);
    if (h.coolUntil != null && h.coolUntil > now) {
      soonest = Math.min(soonest, h.coolUntil - now);
    }
  }
  return Number.isFinite(soonest) ? soonest : 0;
}

/** 后台诊断用：每档视觉模型当前的冷却与最后一次错误。 */
export function vlChainSnapshot() {
  return env.identifyVlModels.map((model) => {
    const h = healthOf(model);
    const cooling = h.coolUntil != null && h.coolUntil > Date.now();
    return {
      model,
      status: cooling ? (h.lastErrorKind ?? "down") : "ok",
      coolUntil: cooling ? h.coolUntil : null,
      lastOkAt: h.lastOkAt,
      lastError: h.lastError,
    };
  });
}
