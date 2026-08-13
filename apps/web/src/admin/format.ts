import { t, hasMessage, type MessageKey } from "@biotrace/messages";

const BEIJING_DT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** ISO / epoch → `2026-08-12 10:49:35`（北京时间）；空则「—」 */
export function formatAdminTime(value: string | number | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return t("admin.utcDay", { day: value });
  }
  const d =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(value.includes("T") || value.includes(" ") ? value : Number(value) || value);
  if (Number.isNaN(d.getTime())) return String(value);
  return BEIJING_DT.format(d).replace("T", " ");
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

export function identifyProviderName(id: string | null | undefined): string {
  if (!id) return "—";
  if (id === "zhipu") return t("admin.identifyRoute.zhipuName");
  if (id === "gemini") return t("admin.identifyRoute.gemini");
  return id;
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

export function rarityLabel(rarity: string | null | undefined): string {
  if (!rarity) return "—";
  const key = `rarity.${rarity}`;
  return hasMessage(key) ? t(key) : rarity;
}

export function settleTierLabel(tier: string | null | undefined): string {
  const map: Record<string, MessageKey> = {
    full: "admin.settleTier.full",
    weak: "admin.settleTier.weak",
    none: "admin.settleTier.none",
  };
  if (!tier) return "—";
  const key = map[tier];
  return key ? t(key) : tier;
}

export function countrySourceLabel(source: string | null | undefined): string {
  const map: Record<string, MessageKey> = {
    tianditu: "admin.countrySource.tianditu",
    offline: "admin.countrySource.offline",
    none: "admin.countrySource.none",
  };
  if (!source) return "—";
  const key = map[source];
  return key ? t(key) : source;
}

export function auditActionLabel(action: string): string {
  const map: Record<string, MessageKey> = {
    "admin.login": "admin.audit.adminLogin",
    "user.reset_password": "admin.audit.userResetPassword",
    "user.clear_byok": "admin.audit.userClearOwnKey",
    "user.set_identify_usage": "admin.audit.userSetUsage",
    "user.delete": "admin.audit.userDelete",
    "observation.requeue": "admin.audit.obsRequeue",
    "observation.reidentify": "admin.audit.obsReidentify",
    "observation.recompute_settle": "admin.audit.obsRecompute",
    "observation.delete": "admin.audit.obsDelete",
    "secrets.patch": "admin.audit.secretsPatch",
    "storage.delete_orphans": "admin.audit.deleteOrphans",
    "rarity_cache.clear": "admin.audit.clearRarity",
  };
  const key = map[action];
  return key ? t(key) : action;
}

export function auditTargetTypeLabel(type: string | null | undefined): string {
  const map: Record<string, MessageKey> = {
    user: "admin.nav.users",
    observation: "admin.nav.observations",
  };
  if (!type) return "—";
  const key = map[type];
  return key ? t(key) : type;
}

export function yesNo(v: unknown): string {
  return v ? t("admin.yes") : t("admin.no");
}
