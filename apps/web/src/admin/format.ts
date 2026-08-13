import { t, type MessageKey } from "@biotrace/messages";

/** ISO / epoch → 北京时间可读串；空则「—」 */
export function formatAdminTime(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const d =
    typeof value === "number"
      ? new Date(value)
      : new Date(value.includes("T") ? value : Number(value) || value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const OBS_ERROR_KEYS: Record<string, MessageKey> = {
  identify_too_coarse: "admin.error.identifyTooCoarse",
  identify_quota: "admin.error.identifyQuota",
  identify_daily_limit: "admin.error.identifyDailyLimit",
  identify_user_key_incomplete: "admin.error.identifyUserKeyIncomplete",
  identify_unavailable: "admin.error.identifyUnavailable",
  identify_not_organism: "admin.error.identifyNotOrganism",
  identify_human: "admin.error.identifyHuman",
  identify_not_living: "admin.error.identifyNotLiving",
  identify_not_collectible: "admin.error.identifyNotCollectible",
};

/** 观察 error 字段：稳定 code 译成管理端中文；已是中文原文则原样展示 */
export function explainObsError(raw: string | null | undefined): { title: string; code: string | null } {
  const s = (raw ?? "").trim();
  if (!s) return { title: t("admin.error.none"), code: null };
  const key = OBS_ERROR_KEYS[s];
  if (key) return { title: t(key), code: s };
  if (/[\u4e00-\u9fff]/.test(s)) return { title: s, code: null };
  return { title: t("admin.error.unknown", { detail: s.slice(0, 160) }), code: s.slice(0, 80) };
}

export function obsStatusLabel(status: string): string {
  const map: Record<string, MessageKey> = {
    analyzing: "admin.status.analyzing",
    pending_settle: "admin.status.pendingSettle",
    settled: "admin.status.settled",
    failed: "admin.status.failed",
  };
  const key = map[status];
  return key ? t(key) : status;
}

export function providerStatusLabel(status: string): string {
  const map: Record<string, MessageKey> = {
    ok: "admin.provider.ok",
    rate_limited: "admin.provider.rateLimited",
    daily_exhausted: "admin.provider.dailyExhausted",
    auth_error: "admin.provider.authError",
    no_key: "admin.provider.noKey",
    down: "admin.provider.down",
  };
  const key = map[status];
  return key ? t(key) : status;
}

export function identifyRouteReasonLabel(reason: string): string {
  const map: Record<string, MessageKey> = {
    gemini_ok: "admin.identifyRoute.reason.gemini_ok",
    gemini_daily_exhausted: "admin.identifyRoute.reason.gemini_daily_exhausted",
    gemini_rate_limited: "admin.identifyRoute.reason.gemini_rate_limited",
    gemini_down: "admin.identifyRoute.reason.gemini_down",
    gemini_auth: "admin.identifyRoute.reason.gemini_auth",
    gemini_no_key: "admin.identifyRoute.reason.gemini_no_key",
    gemini_unconfigured: "admin.identifyRoute.reason.gemini_unconfigured",
    both_unavailable: "admin.identifyRoute.reason.both_unavailable",
  };
  const key = map[reason];
  return key ? t(key) : reason;
}

export function identifyRouteActiveLabel(active: string): string {
  if (active === "zhipu") return t("admin.identifyRoute.zhipu");
  if (active === "none") return t("admin.identifyRoute.none");
  return t("admin.identifyRoute.gemini");
}

export function identifyProviderName(id: string): string {
  if (id === "zhipu") return t("admin.identifyRoute.zhipuName");
  return t("admin.identifyRoute.gemini");
}

export function flagLabel(key: string): string {
  const map: Record<string, MessageKey> = {
    devAuth: "admin.flag.devAuth",
    identifyMock: "admin.flag.identifyMock",
    gbifEnabled: "admin.flag.gbifEnabled",
    sessionSecretIsDefault: "admin.flag.sessionSecretDefault",
  };
  const mk = map[key];
  return mk ? t(mk) : key;
}
