import { t } from "@biotrace/messages";

const ELIGIBILITY_CODES = new Set([
  "identify_not_organism",
  "identify_human",
  "identify_not_living",
  "identify_no_kingdom",
]);

export function isNotCollectibleError(code: string | null | undefined): boolean {
  return Boolean(code && ELIGIBILITY_CODES.has(code));
}

/** 软档：影像/标本上的真生物，已识别但不进图鉴。 */
export function isSoftEncounterError(code: string | null | undefined): boolean {
  return code === "identify_soft_encounter";
}

/** 留影档：照片留在相册、不进图鉴。非故障，前端一律中性灰，不用红字。 */
export function isKeepsakeError(code: string | null | undefined): boolean {
  return code === "identify_keepsake";
}

/** 非故障类（不进图鉴但系统没坏）：留影 + 软档 + 太粗。这些不配红字。 */
export function isNotAFault(code: string | null | undefined): boolean {
  return isKeepsakeError(code) || isSoftEncounterError(code) || code === "identify_too_coarse";
}

/** User-facing primary line for observation.error codes. Never dump raw stack/API junk. */
export function identifyErrorPrimary(code: string | null | undefined): string {
  if (!code) return t("error.identifyGenericFailed");
  if (isKeepsakeError(code) || isNotCollectibleError(code)) return t("error.identifyKeepsake");
  if (isSoftEncounterError(code)) return t("error.identifySoftEncounter");
  if (code === "identify_too_coarse") return t("error.identifyTooCoarse");
  if (code === "identify_quota") return t("error.identifyQuota");
  if (code === "identify_daily_limit") return t("error.identifyDailyLimit");
  if (code === "identify_user_key_incomplete") return t("error.identifyUserKeyIncomplete");
  if (code === "identify_unavailable") return t("error.identifyUnavailable");
  // Localized server messages are already Chinese sentences; keep them.
  if (/[\u4e00-\u9fff]/.test(code)) return code;
  return t("error.identifyGenericFailed");
}

export function identifyErrorHint(code: string | null | undefined): string | null {
  if (isKeepsakeError(code) || isNotCollectibleError(code)) return t("error.identifyKeepsakeHint");
  if (isSoftEncounterError(code)) return t("error.identifySoftEncounterHint");
  if (code === "identify_daily_limit") return t("me.identifyQuotaHint");
  return null;
}
