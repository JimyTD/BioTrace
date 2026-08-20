/**
 * 文本模型优先级链（TokenHub 单 key，只换模型名）。
 * 按 env.rarityTextModels 顺序试：限流/抖动就地退避重试，配额耗尽或鉴权失败则打冷却降到下一档。
 * 返回值带上实际生效的模型名——缓存要记它，事后才查得出某一行是哪档模型判的。
 */
import { Agent, fetch as undiciFetch } from "undici";
import { env } from "../env.js";
import { classifyProviderError, parseRetryDelayMs, type ErrorKind } from "../identify/health.js";

export type TextChainResult = { content: string; model: string };

type ModelHealth = {
  coolUntil: number | null;
  lastError: string | null;
  lastErrorKind: ErrorKind | null;
  lastOkAt: number | null;
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

/**
 * 必须显式直连：`identify/gemini.ts` 用 setGlobalDispatcher 装了出境代理，
 * 若沿用全局 dispatcher，对 TokenHub（国内服务）的请求会被绕去境外代理再回来。
 * 同 `settle/geo/tiandituGeocode.ts` 的处理。
 */
let directAgent: Agent | null = null;
function agent(): Agent {
  if (!directAgent) directAgent = new Agent();
  return directAgent;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 各模型的请求差异（实测得来）：不迁就就是整档 400，白白降级。
 * 按模型名精确匹配，没登记的走默认（temperature 0 + 关思考）。
 */
const MODEL_QUIRKS: Record<string, { temperature?: number; sendThinking?: boolean }> = {
  // 始终思考，带 thinking 字段一律 400（连它自己提示的 low/high/max 也不认），只能不发。
  "glm-5.3": { sendThinking: false },
  // 只接受 temperature 0.6，发 0 会 400。
  "kimi-k3": { temperature: 0.6, sendThinking: false },
};

/**
 * TokenHub 的网关错误码会撞上通用分类器：`401006`（endpoint is inactive）里带 "401"
 * 会被当成鉴权失败冷却半小时，而它实际上是瞬态，重试即通。
 */
function classifyTokenhubError(message: string): ErrorKind {
  if (/endpoint is inactive|HTTP 402/i.test(message)) return "transient";
  return classifyProviderError(message);
}

/** 鉴权失败与彻底不认这个模型名都不该反复撞，冷却给长一点。 */
function coolMsFor(kind: ErrorKind, message: string): number {
  switch (kind) {
    case "rate_limited":
      return parseRetryDelayMs(message);
    case "daily_exhausted":
      return 6 * 60 * 60_000;
    case "auth":
      return 30 * 60_000;
    case "transient":
      return 20_000;
    default:
      return 10 * 60_000;
  }
}

async function callOnce(model: string, prompt: string, system: string): Promise<string> {
  if (!env.tokenhubApiKey) throw new Error("TOKENHUB_API_KEY is not set");
  const url = `${env.tokenhubBaseUrl.replace(/\/+$/, "")}/chat/completions`;
  const quirks = MODEL_QUIRKS[model] ?? {};
  const payload: Record<string, unknown> = {
    model,
    temperature: quirks.temperature ?? 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  };
  if (quirks.sendThinking !== false) {
    payload.thinking = { type: env.rarityThinking ? "enabled" : "disabled" };
  }
  const res = await undiciFetch(url, {
    dispatcher: agent(),
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.tokenhubApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`TokenHub HTTP ${res.status} (${model}): ${body.slice(0, 300)}`);
  const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error(`empty content (${model})`);
  return content;
}

/**
 * 沿链取第一个能出货的模型。全链都不可用时抛 `rarity_model_unavailable`。
 * 单模型内最多 attemptsPerModel 次（仅限流与抖动才重试）。
 */
export async function callTextChain(
  prompt: string,
  opts?: { system?: string; attemptsPerModel?: number },
): Promise<TextChainResult> {
  const system = opts?.system ?? "只输出合法 JSON 对象。";
  const attempts = Math.max(1, opts?.attemptsPerModel ?? 3);
  const now = () => Date.now();
  let lastError: string | null = null;

  for (const model of env.rarityTextModels) {
    const h = healthOf(model);
    if (h.coolUntil != null && h.coolUntil > now()) continue;

    for (let i = 1; i <= attempts; i++) {
      try {
        const content = await callOnce(model, prompt, system);
        health.set(model, {
          coolUntil: null,
          lastError: null,
          lastErrorKind: null,
          lastOkAt: now(),
        });
        return { content, model };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const kind = classifyTokenhubError(message);
        lastError = message;
        const retryable = kind === "rate_limited" || kind === "transient";
        if (!retryable || i === attempts) {
          health.set(model, {
            coolUntil: now() + coolMsFor(kind, message),
            lastError: message.slice(0, 400),
            lastErrorKind: kind,
            lastOkAt: h.lastOkAt,
          });
          console.warn(`[rarity] model ${model} ${kind}, 降级下一档: ${message.slice(0, 160)}`);
          break;
        }
        await sleep(Math.min(30_000, kind === "rate_limited" ? parseRetryDelayMs(message) : 2_000 * i));
      }
    }
  }

  throw new Error(
    `rarity_model_unavailable${lastError ? `: ${lastError.slice(0, 200)}` : ""}`,
  );
}

/** 后台诊断用：每档模型当前的冷却与最后一次错误。 */
export function textChainSnapshot() {
  return env.rarityTextModels.map((model) => {
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
