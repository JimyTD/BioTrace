import { env } from "../env.js";
import { identifyWithOpenAICompatible } from "./openai-compatible.js";
import type { IdentifyInput, IdentifyResult } from "./types.js";

/** Zhipu / GLM vision via OpenAI-compatible chat completions. */
export async function identifyWithZhipu(input: IdentifyInput): Promise<IdentifyResult> {
  if (!env.zhipuApiKey) {
    throw new Error("ZHIPU_API_KEY is not set");
  }
  return identifyWithOpenAICompatible(input, {
    baseUrl: env.zhipuBaseUrl,
    apiKey: env.zhipuApiKey,
    model: env.zhipuVlModel,
  });
}
