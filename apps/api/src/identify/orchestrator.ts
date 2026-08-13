import { env } from "../env.js";
import { bumpProviderStat, markGeminiExhaustedToday } from "../services/identify-provider-stats.js";
import { identifyWithGemini } from "./gemini.js";
import {
  classifyProviderError,
  coolRemainingMs,
  getProviderHealth,
  markProviderError,
  markProviderNoKey,
  markProviderOk,
  parseRetryDelayMs,
  type ErrorKind,
  type ProviderId,
} from "./health.js";
import type { IdentifyInput, IdentifyResult } from "./types.js";
import { identifyWithZhipu } from "./zhipu.js";

export type IdentifyOutcome = {
  result: IdentifyResult;
  provider: ProviderId;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function applyError(id: ProviderId, message: string): ErrorKind {
  const kind = classifyProviderError(message);
  if (kind === "no_key") {
    markProviderNoKey(id);
    return kind;
  }
  const coolMs =
    kind === "daily_exhausted"
      ? 12 * 60 * 60_000
      : kind === "rate_limited"
        ? parseRetryDelayMs(message)
        : kind === "transient"
          ? 20_000
          : kind === "auth"
            ? 0
            : 60_000;
  markProviderError(id, kind, message, coolMs);
  return kind;
}

function configured(id: ProviderId): boolean {
  return id === "gemini" ? Boolean(env.geminiApiKey) : Boolean(env.zhipuApiKey);
}

async function recordCall(id: ProviderId, kind: "success" | "fail", errorKind?: ErrorKind) {
  try {
    await bumpProviderStat(id, kind);
    if (id === "gemini" && errorKind === "daily_exhausted") {
      await markGeminiExhaustedToday();
    }
  } catch (err) {
    console.warn("[identify] provider daily stat failed", err);
  }
}

async function callProvider(id: ProviderId, input: IdentifyInput): Promise<IdentifyResult> {
  if (!configured(id)) {
    markProviderNoKey(id);
    throw new Error(id === "gemini" ? "GEMINI_API_KEY is not set" : "ZHIPU_API_KEY is not set");
  }
  try {
    const result = id === "gemini" ? await identifyWithGemini(input) : await identifyWithZhipu(input);
    markProviderOk(id);
    await recordCall(id, "success");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const kind = applyError(id, message);
    if (kind !== "no_key") {
      await recordCall(id, "fail", kind);
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * Prefer Gemini; short cool → wait while still analyzing; long/daily → GLM.
 * Throws identify_unavailable only when both sides cannot serve within deadline.
 */
export async function identifyWithFallback(input: IdentifyInput): Promise<IdentifyOutcome> {
  const deadline = Date.now() + env.identifyJobDeadlineMs;
  const waitMax = env.identifyGeminiWaitMaxMs;
  let geminiTries = 0;
  let zhipuTries = 0;

  while (Date.now() < deadline) {
    // --- Gemini path ---
    if (configured("gemini")) {
      const g = getProviderHealth("gemini");
      const cool = coolRemainingMs("gemini");

      if (g.status === "ok" || (cool > 0 && cool <= waitMax)) {
        if (cool > 0 && cool <= waitMax) {
          console.warn(`[identify] Gemini cooling ${Math.ceil(cool / 1000)}s — staying analyzing`);
          await sleep(Math.min(cool + 200, deadline - Date.now()));
        }
        if (Date.now() >= deadline) break;
        geminiTries++;
        try {
          const result = await callProvider("gemini", input);
          return { result, provider: "gemini" };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const kind = classifyProviderError(message);
          const nextCool = coolRemainingMs("gemini");
          console.warn(`[identify] Gemini failed (${kind}): ${message.slice(0, 160)}`);

          if (kind === "rate_limited" && nextCool > 0 && nextCool <= waitMax && geminiTries < 3) {
            continue;
          }
          // daily / long cool / auth / fatal → fall through to GLM
        }
      } else if (g.status === "rate_limited" && cool > waitMax) {
        console.warn(`[identify] Gemini cool ${Math.ceil(cool / 1000)}s > wait max — use GLM`);
      } else if (g.status === "daily_exhausted") {
        console.warn("[identify] Gemini daily exhausted — use GLM");
      }
    }

    // --- GLM path ---
    if (configured("zhipu")) {
      const z = getProviderHealth("zhipu");
      const cool = coolRemainingMs("zhipu");

      if (z.status === "ok" || (cool > 0 && cool <= waitMax)) {
        if (cool > 0 && cool <= waitMax) {
          console.warn(`[identify] GLM cooling ${Math.ceil(cool / 1000)}s — staying analyzing`);
          await sleep(Math.min(cool + 200, deadline - Date.now()));
        }
        if (Date.now() >= deadline) break;
        zhipuTries++;
        try {
          const result = await callProvider("zhipu", input);
          return { result, provider: "zhipu" };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const kind = classifyProviderError(message);
          const nextCool = coolRemainingMs("zhipu");
          console.warn(`[identify] GLM failed (${kind}): ${message.slice(0, 160)}`);
          if (kind === "rate_limited" && nextCool > 0 && nextCool <= waitMax && zhipuTries < 3) {
            continue;
          }
        }
      }

      // Both hot: wait for the sooner cool if within remaining deadline
      const gCool = configured("gemini") ? coolRemainingMs("gemini") : Number.POSITIVE_INFINITY;
      const zCool = coolRemainingMs("zhipu");
      const soonest = Math.min(gCool, zCool);
      if (Number.isFinite(soonest) && soonest > 0 && Date.now() + soonest < deadline) {
        const slice = Math.min(soonest, waitMax, deadline - Date.now());
        if (slice > 0) {
          console.warn(`[identify] both busy — wait ${Math.ceil(slice / 1000)}s`);
          await sleep(slice + 200);
          continue;
        }
      }
    }

    break;
  }

  throw new Error("identify_unavailable");
}
