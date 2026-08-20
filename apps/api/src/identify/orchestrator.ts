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
import { identifyWithVlChain, vlChainReady, vlChainSoonestCoolMs } from "./vl-chain.js";

export type IdentifyOutcome = {
  result: IdentifyResult;
  provider: ProviderId;
  model: string | null;
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
  return id === "gemini" ? Boolean(env.geminiApiKey) : Boolean(env.tokenhubApiKey);
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

async function callGemini(input: IdentifyInput): Promise<IdentifyResult> {
  if (!configured("gemini")) {
    markProviderNoKey("gemini");
    throw new Error("GEMINI_API_KEY is not set");
  }
  try {
    const result = await identifyWithGemini(input);
    markProviderOk("gemini");
    await recordCall("gemini", "success");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const kind = applyError("gemini", message);
    if (kind !== "no_key") {
      await recordCall("gemini", "fail", kind);
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

async function callTokenhub(input: IdentifyInput): Promise<{ result: IdentifyResult; model: string }> {
  if (!configured("tokenhub")) {
    markProviderNoKey("tokenhub");
    throw new Error("TOKENHUB_API_KEY is not set");
  }
  try {
    const outcome = await identifyWithVlChain(input);
    markProviderOk("tokenhub");
    await recordCall("tokenhub", "success");
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const kind = applyError("tokenhub", message);
    if (kind !== "no_key") {
      await recordCall("tokenhub", "fail", kind);
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * Prefer Gemini; short cool → wait while still analyzing; long/daily → TokenHub VL chain.
 * 429: up to 3 tries while cool ≤ waitMax. Transient 5xx: one retry after ~20s.
 * Throws identify_unavailable only when both sides cannot serve within deadline.
 */
export async function identifyWithFallback(input: IdentifyInput): Promise<IdentifyOutcome> {
  const deadline = Date.now() + env.identifyJobDeadlineMs;
  const waitMax = env.identifyGeminiWaitMaxMs;
  let geminiTries = 0;

  while (Date.now() < deadline) {
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
          const result = await callGemini(input);
          return { result, provider: "gemini", model: env.geminiModel };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const kind = classifyProviderError(message);
          const nextCool = coolRemainingMs("gemini");
          console.warn(`[identify] Gemini failed (${kind}): ${message.slice(0, 160)}`);

          const retryGemini =
            nextCool > 0 &&
            nextCool <= waitMax &&
            ((kind === "rate_limited" && geminiTries < 3) ||
              (kind === "transient" && geminiTries < 2));
          if (retryGemini) {
            continue;
          }
        }
      } else if (g.status === "rate_limited" && cool > waitMax) {
        console.warn(`[identify] Gemini cool ${Math.ceil(cool / 1000)}s > wait max — use TokenHub VL`);
      } else if (g.status === "daily_exhausted") {
        console.warn("[identify] Gemini daily exhausted — use TokenHub VL");
      }
    }

    if (configured("tokenhub")) {
      if (!vlChainReady()) {
        const wait = vlChainSoonestCoolMs();
        if (wait > 0 && wait <= waitMax && Date.now() + wait < deadline) {
          console.warn(`[identify] TokenHub VL cooling ${Math.ceil(wait / 1000)}s`);
          await sleep(Math.min(wait + 200, deadline - Date.now()));
        }
      }
      if (vlChainReady()) {
        try {
          const { result, model } = await callTokenhub(input);
          return { result, provider: "tokenhub", model };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[identify] TokenHub VL failed: ${message.slice(0, 160)}`);
        }
      }
    }

    break;
  }

  throw new Error("identify_unavailable");
}
