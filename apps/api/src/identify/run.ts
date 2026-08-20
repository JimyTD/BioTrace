import { env } from "../env.js";
import { tryConsumePlatformIdentifyQuota } from "../services/identify-quota.js";
import { resolveUserIdentify } from "../services/user-identify.js";
import { mockIdentifyResult } from "./mock.js";
import { identifyWithOpenAICompatible } from "./openai-compatible.js";
import { identifyWithFallback } from "./orchestrator.js";
import type { IdentifyInput, IdentifyResult } from "./types.js";

export type IdentifyRunOutcome = {
  result: IdentifyResult;
  provider: string;
  model: string | null;
};

/**
 * User-aware identify entry: mock → own OpenAI-compatible key → platform fallback.
 * Throws `identify_daily_limit` / `identify_user_key_incomplete` / provider errors.
 */
export async function runIdentifyForUser(
  userId: string,
  input: IdentifyInput,
): Promise<IdentifyRunOutcome> {
  const own = await resolveUserIdentify(userId);

  if (own.useOwnKey) {
    if (!own.ready || !own.creds) {
      throw new Error("identify_user_key_incomplete");
    }
    if (env.identifyMock) {
      return { result: mockIdentifyResult(input), provider: "mock", model: null };
    }
    const result = await identifyWithOpenAICompatible(input, own.creds);
    return { result, provider: "user", model: own.creds.model };
  }

  if (env.identifyMock) {
    const allowed = await tryConsumePlatformIdentifyQuota(userId);
    if (!allowed) throw new Error("identify_daily_limit");
    return { result: mockIdentifyResult(input), provider: "mock", model: null };
  }

  const allowed = await tryConsumePlatformIdentifyQuota(userId);
  if (!allowed) throw new Error("identify_daily_limit");

  const outcome = await identifyWithFallback(input);
  return { result: outcome.result, provider: outcome.provider, model: outcome.model };
}
