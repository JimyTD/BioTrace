import { t } from "@biotrace/messages";
import type { IdentifyResult, SubjectKind } from "./types.js";

export type EligibilityErrorCode =
  | "identify_not_organism"
  | "identify_human"
  | "identify_not_living"
  | "identify_no_kingdom"
  /** 留影档（2026-09-08 拍板）：照片永远留在相册，只是不进图鉴。非故障，不用红字 */
  | "identify_keepsake";

/**
 * 识别软档：真生物但非野外相遇（宣传图/屏幕里的真牛、馆藏标本）。
 * 识别放行、详情展示全套字段，但不进结算、不给稀有度、不进图鉴。
 */
export type EligibilitySoft = {
  kind: "depiction_or_media" | "specimen";
  /** 模型给的理由（如「画布上的真牛，非野外相遇」），详情页展示用 */
  reasonZh: string;
};

/**
 * 识别留影档（2026-09-08 拍板）：没生物 / 生物仅背景 / 分不清 / 人 / 器物。
 * 照片本身就该留在相册——识别不报错、不给稀有度、不进图鉴，仅此而已。
 * 标题走 subject_title_zh（agent 给的短名），识别不出来也不补分类信息。
 */
export type EligibilityKeepsake = {
  kind: SubjectKind;
  reasonZh: string;
};

export type EligibilityDecision =
  | { ok: true }
  | {
      ok: false;
      code: EligibilityErrorCode;
      kind: SubjectKind;
      reasonZh: string;
    }
  /** 软档：识别放行，收集拦截 */
  | {
      ok: true;
      soft: EligibilitySoft;
    }
  /** 留影档：识别放行，相册留档，不进图鉴 */
  | {
      ok: true;
      keepsake: EligibilityKeepsake;
    };

const ARTIFACT_HINT =
  /玩具|手办|雕像|塑像|模型|毛绒|公仔|卡通|漫画|动漫|插画|绘本|书页|屏幕|截图|布偶|玩偶/;

function looksHuman(result: IdentifyResult): boolean {
  const sci = result.scientific_name.trim().toLowerCase();
  if (/\bhomo\b/.test(sci) || sci.includes("homo sapiens")) return true;
  const common = result.common_name_zh.trim();
  if (/^(人|人类|男人|女人|小孩|儿童)$/.test(common)) return true;
  if (/人类|真人/.test(common)) return true;
  const genus = result.taxonomy.genus?.name_la?.trim().toLowerCase() ?? "";
  if (genus === "homo") return true;
  return false;
}

function looksArtifactOrDepiction(result: IdentifyResult): boolean {
  const hay = `${result.common_name_zh} ${result.notes} ${result.blurb_zh} ${result.ineligibility_reason_zh}`;
  return ARTIFACT_HINT.test(hay);
}

/**
 * Gate before settle/rarity: only field organisms may become collectible
 * (alive or dead; empty shells count). Missing/invalid fields default to no.
 *
 * 软档规则（2026-09-07 拍板）：subject_kind 为 depiction_or_media / specimen、
 * 且模型给出了真实身份（非空 common_name_zh 或 scientific_name）、
 * 且有界（taxonomy.kingdom.name_la 非空）→ 识别放行为软档；
 * 没身份或没界 → 照旧拦死 identify_not_living。
 */
export function evaluateEligibility(result: IdentifyResult): EligibilityDecision {
  let kind = result.subject_kind;
  let eligibility = result.eligibility;

  if (looksHuman(result)) {
    kind = "human";
    eligibility = "not_collectible";
  } else if (kind === "living_organism" && looksArtifactOrDepiction(result)) {
    kind = "artifact_or_toy";
    eligibility = "not_collectible";
  }

  const collectible = eligibility === "collectible" && kind === "living_organism";
  const kingdomLa = result.taxonomy.kingdom?.name_la?.trim() ?? "";

  /* 认不出界：不是错误，归留影（照片仍在相册，只是不进图鉴） */
  if (collectible && !kingdomLa) {
    return {
      ok: true,
      keepsake: {
        kind,
        reasonZh: result.ineligibility_reason_zh.trim() || t("error.identifyGenericFailed"),
      },
    };
  }

  if (collectible) return { ok: true };

  /* 软档：影像/标本上的真生物，有身份有界才放行识别 */
  if ((kind === "depiction_or_media" || kind === "specimen") && kingdomLa) {
    const hasIdentity =
      result.common_name_zh.trim().length > 0 || result.scientific_name.trim().length > 0;
    if (hasIdentity) {
      return {
        ok: true,
        soft: {
          kind,
          reasonZh:
            result.ineligibility_reason_zh.trim() || t("error.identifySoftDefaultReason"),
        },
      };
    }
  }

  const reasonZh =
    result.ineligibility_reason_zh.trim() ||
    (kind === "human"
      ? t("error.identifyHumanReason")
      : kind === "artifact_or_toy" ||
          kind === "depiction_or_media" ||
          kind === "specimen"
        ? t("error.identifyNotLivingReason")
        : t("error.identifyNotOrganismReason"));

  /* 留影档：其余一切（无生物、仅背景、分不清、人、器物）都不再拦，
     照片留在相册，只是不进图鉴。硬拦（红字）只留给真故障。 */
  return {
    ok: true,
    keepsake: {
      kind,
      reasonZh,
    },
  };
}

/** 留影档：识别过、留在相册，只是不进图鉴。非故障，前端不用红字。 */
export function isKeepsakeError(code: string | null | undefined): boolean {
  return code === "identify_keepsake";
}

export function isEligibilityErrorCode(code: string | null | undefined): code is EligibilityErrorCode {
  return (
    code === "identify_not_organism" ||
    code === "identify_human" ||
    code === "identify_not_living" ||
    code === "identify_no_kingdom" ||
    code === "identify_keepsake"
  );
}
