import { env } from "../env.js";
import { providerStatsToday } from "../services/identify-provider-stats.js";
import { utcDayKey } from "../services/identify-quota.js";
import {
  coolRemainingMs,
  getProviderHealth,
  providerSnapshot,
  type ProviderId,
} from "./health.js";

export type IdentifyRouteReason =
  | "gemini_ok"
  | "gemini_daily_exhausted"
  | "gemini_rate_limited"
  | "gemini_down"
  | "gemini_auth"
  | "gemini_no_key"
  | "gemini_unconfigured"
  | "both_unavailable";

function configured(id: ProviderId): boolean {
  return id === "gemini" ? Boolean(env.geminiApiKey) : Boolean(env.zhipuApiKey);
}

function providerReady(id: ProviderId): boolean {
  if (!configured(id)) return false;
  const h = getProviderHealth(id);
  const cool = coolRemainingMs(id);
  return h.status === "ok" || (cool > 0 && cool <= env.identifyGeminiWaitMaxMs);
}

function geminiSkipReason(): IdentifyRouteReason {
  if (!configured("gemini")) return "gemini_unconfigured";
  const h = getProviderHealth("gemini");
  if (h.status === "daily_exhausted") return "gemini_daily_exhausted";
  if (h.status === "rate_limited") return "gemini_rate_limited";
  if (h.status === "auth_error") return "gemini_auth";
  if (h.status === "no_key") return "gemini_no_key";
  if (h.status === "down") return "gemini_down";
  return "gemini_ok";
}

function toEpochMs(value: Date | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const ms = value.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function packProvider(id: ProviderId, stats: Awaited<ReturnType<typeof providerStatsToday>>[ProviderId]) {
  return {
    ...providerSnapshot(id, configured(id)),
    todaySuccess: stats.success,
    todayFail: stats.fail,
    exhaustedAt: toEpochMs(stats.exhaustedAt),
    successAtExhaust: stats.successAtExhaust,
  };
}

/** Same decision the orchestrator uses for the next platform identify. */
export async function identifyRoutingSnapshot() {
  const stats = await providerStatsToday();
  const geminiReady = providerReady("gemini");
  const zhipuReady = providerReady("zhipu");
  const usingZhipuFallback = !geminiReady && zhipuReady;
  const activeProvider: ProviderId | "none" = geminiReady
    ? "gemini"
    : zhipuReady
      ? "zhipu"
      : "none";
  const reason: IdentifyRouteReason = geminiReady
    ? "gemini_ok"
    : zhipuReady
      ? geminiSkipReason()
      : "both_unavailable";

  return {
    day: utcDayKey(),
    activeProvider,
    usingZhipuFallback,
    reason,
    geminiWaitMaxMs: env.identifyGeminiWaitMaxMs,
    gemini: packProvider("gemini", stats.gemini),
    zhipu: packProvider("zhipu", stats.zhipu),
  };
}
