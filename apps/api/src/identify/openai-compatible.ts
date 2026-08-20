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

/** Normalize user/base URL to `.../chat/completions`. */
export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

export type OpenAICompatibleCreds = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export function contentToText(content: string | unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        typeof p === "object" && p && "text" in p ? String((p as { text: string }).text) : "",
      )
      .join("\n");
  }
  return "";
}

/** Vision identify via OpenAI-compatible chat completions (user BYOK). */
export async function identifyWithOpenAICompatible(
  input: IdentifyInput,
  creds: OpenAICompatibleCreds,
): Promise<IdentifyResult> {
  const bytes = await readFile(input.imagePath);
  const url = chatCompletionsUrl(creds.baseUrl);
  const res = await undiciFetch(url, {
    ...fetchInit(),
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: creds.model,
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
    throw new Error(`OpenAI-compatible HTTP ${res.status}: ${textBody.slice(0, 500)}`);
  }

  let data: { choices?: Array<{ message?: { content?: string | unknown } }> };
  try {
    data = JSON.parse(textBody) as typeof data;
  } catch {
    throw new Error(`OpenAI-compatible returned non-JSON: ${textBody.slice(0, 200)}`);
  }

  const text = contentToText(data.choices?.[0]?.message?.content);
  if (!text.trim()) throw new Error("OpenAI-compatible returned empty content");
  return extractIdentifyJson(text);
}
