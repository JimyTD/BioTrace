import { readFile } from "node:fs/promises";
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../env.js";
import { buildIdentifyPrompt, extractIdentifyJson } from "./prompt.js";
import type { IdentifyInput, IdentifyResult } from "./types.js";

function fetchInit(): RequestInit {
  const init: RequestInit = {};
  if (env.httpsProxy) {
    init.dispatcher = new ProxyAgent(env.httpsProxy);
  }
  return init;
}

function imageDataUrl(mimeType: string, bytes: Buffer): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

/** Zhipu / GLM vision via OpenAI-compatible chat completions. */
export async function identifyWithZhipu(input: IdentifyInput): Promise<IdentifyResult> {
  if (!env.zhipuApiKey) {
    throw new Error("ZHIPU_API_KEY is not set");
  }

  const bytes = await readFile(input.imagePath);
  const url = `${env.zhipuBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await undiciFetch(url, {
    ...fetchInit(),
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.zhipuApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.zhipuVlModel,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildIdentifyPrompt(input) },
            {
              type: "image_url",
              image_url: { url: imageDataUrl(input.mimeType, bytes) },
            },
          ],
        },
      ],
    }),
  });

  const textBody = await res.text();
  if (!res.ok) {
    throw new Error(`Zhipu HTTP ${res.status}: ${textBody.slice(0, 500)}`);
  }

  let data: { choices?: Array<{ message?: { content?: string | unknown } }> };
  try {
    data = JSON.parse(textBody) as typeof data;
  } catch {
    throw new Error(`Zhipu returned non-JSON: ${textBody.slice(0, 200)}`);
  }

  const content = data.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text: string }).text) : ""))
            .join("\n")
        : "";
  if (!text.trim()) throw new Error("Zhipu returned empty content");
  return extractIdentifyJson(text);
}
