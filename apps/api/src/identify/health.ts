export type ProviderId = "gemini" | "zhipu";

export type ProviderStatus =
  | "ok"
  | "rate_limited"
  | "daily_exhausted"
  | "auth_error"
  | "no_key"
  | "down";

export type ErrorKind =
  | "rate_limited"
  | "daily_exhausted"
  | "auth"
  | "transient"
  | "fatal"
  | "no_key";

export type ProviderHealth = {
  status: ProviderStatus;
  coolUntil: number | null;
  lastErrorAt: number | null;
  lastOkAt: number | null;
  lastError: string | null;
};

const state: Record<ProviderId, ProviderHealth> = {
  gemini: { status: "ok", coolUntil: null, lastErrorAt: null, lastOkAt: null, lastError: null },
  zhipu: { status: "ok", coolUntil: null, lastErrorAt: null, lastOkAt: null, lastError: null },
};

export function getProviderHealth(id: ProviderId): ProviderHealth {
  const h = state[id];
  if (h.coolUntil != null && h.coolUntil <= Date.now() && h.status !== "no_key" && h.status !== "auth_error") {
    if (h.status === "rate_limited" || h.status === "daily_exhausted" || h.status === "down") {
      state[id] = { ...h, status: "ok", coolUntil: null };
    }
  }
  return { ...state[id] };
}

export function markProviderOk(id: ProviderId) {
  state[id] = {
    status: "ok",
    coolUntil: null,
    lastErrorAt: null,
    lastOkAt: Date.now(),
    lastError: null,
  };
}

export function markProviderNoKey(id: ProviderId) {
  state[id] = {
    ...state[id],
    status: "no_key",
    coolUntil: null,
    lastErrorAt: Date.now(),
    lastError: "no_key",
  };
}

export function markProviderError(id: ProviderId, kind: ErrorKind, message: string, coolMs: number) {
  const status: ProviderStatus =
    kind === "daily_exhausted"
      ? "daily_exhausted"
      : kind === "rate_limited"
        ? "rate_limited"
        : kind === "auth" || kind === "no_key"
          ? kind === "no_key"
            ? "no_key"
            : "auth_error"
          : "down";

  const coolUntil =
    status === "no_key" || status === "auth_error" ? null : Date.now() + Math.max(coolMs, 0);

  state[id] = {
    status,
    coolUntil,
    lastErrorAt: Date.now(),
    lastOkAt: state[id].lastOkAt,
    lastError: message.slice(0, 400),
  };
}

/** Classify raw provider error text. */
export function classifyProviderError(message: string): ErrorKind {
  const m = message.toLowerCase();
  if (m.includes("is not set") || m.includes("no_key") || m.includes("api key")) {
    if (m.includes("not set") || m.includes("no_key") || m.includes("missing")) return "no_key";
  }
  if (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("api_key_invalid") ||
    m.includes("invalid api key") ||
    m.includes("permission")
  ) {
    return "auth";
  }
  if (
    m.includes("perday") ||
    m.includes("per_day") ||
    m.includes("daily") ||
    m.includes("freetier") ||
    m.includes("free_tier") ||
    m.includes("generate_content_free_tier") ||
    m.includes("generaterequestsperday")
  ) {
    return "daily_exhausted";
  }
  if (
    m.includes("429") ||
    m.includes("too many requests") ||
    m.includes("quota exceeded") ||
    m.includes("exceeded your current quota") ||
    m.includes("resource_exhausted") ||
    m.includes("rate limit")
  ) {
    return "rate_limited";
  }
  if (
    m.includes("500") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504") ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("unavailable")
  ) {
    return "transient";
  }
  return "fatal";
}

/** Parse "Please retry in 30.65s"; default 35s; clamp. */
export function parseRetryDelayMs(message: string, fallbackMs = 35_000): number {
  const m = message.match(/retry in\s*([\d.]+)\s*s/i);
  const sec = m ? Number(m[1]) : fallbackMs / 1000;
  if (!Number.isFinite(sec)) return fallbackMs;
  return Math.min(Math.max(Math.ceil(sec * 1000) + 500, 5_000), 15 * 60_000);
}

export function coolRemainingMs(id: ProviderId): number {
  const h = getProviderHealth(id);
  if (h.coolUntil == null) return 0;
  return Math.max(0, h.coolUntil - Date.now());
}

export function providerSnapshot(id: ProviderId, configured: boolean) {
  const h = configured ? getProviderHealth(id) : { ...getProviderHealth(id), status: "no_key" as const };
  return {
    configured,
    status: configured ? h.status : ("no_key" as const),
    coolUntil: h.coolUntil,
    lastOkAt: h.lastOkAt,
  };
}
