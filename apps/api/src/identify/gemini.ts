import { readFile } from "node:fs/promises";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../env.js";
import { buildIdentifyPrompt, extractIdentifyJson } from "./prompt.js";
import type { IdentifyInput, IdentifyResult } from "./types.js";

let proxyReady = false;

async function ensureProxy() {
  if (proxyReady || !env.httpsProxy) return;
  const undici = await import("undici");
  undici.setGlobalDispatcher(new undici.ProxyAgent(env.httpsProxy));
  proxyReady = true;
}

/** Single Gemini call — health / retry owned by orchestrator. */
export async function identifyWithGemini(input: IdentifyInput): Promise<IdentifyResult> {
  if (!env.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  await ensureProxy();
  const bytes = await readFile(input.imagePath);
  const genAI = new GoogleGenerativeAI(env.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: env.geminiModel });
  const result = await model.generateContent([
    { text: buildIdentifyPrompt(input) },
    {
      inlineData: {
        mimeType: input.mimeType,
        data: bytes.toString("base64"),
      },
    },
  ]);
  return extractIdentifyJson(result.response.text());
}
