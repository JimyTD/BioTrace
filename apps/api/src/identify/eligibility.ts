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

/** 识别留影档（2026-09-08 拍板）：没生物 / 生物仅背景 / 分不清 / 人 / 器物。
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

/**
 * Gate before settle/rarity: only field organisms may become collectible
 * (alive or dead; empty shells count). Missing/invalid fields default to no.
 *
 * 器物词翻盘已于 2026-09-11 删除（见 docs/wip/识别链路-议题.md 议题3）。
 * 原设计是「模型判活体但结论文字出现器物词时改判器物」，实测误伤远大于收益：
 * 布偶猫（真实猫品种）被「布偶」命中、真猫背上趴着玩具被「玩具」命中，
 * 而它防的「模型把毛绒熊标成活体」场景从未被观测到。
 * 代码凭只言片语断言，比它要防的模型呆得多——模型看的是图，关键词看的是字。
 *
 * 软档规则（2026-09-07 拍板）：subject_kind 为 depiction_or_media / specimen、
 * 且模型给出了真实身份（非空 common_name_zh 或 scientific_name）、
 * 且有界（taxonomy.kingdom.name_la 非空）→ 识别放行为软档；
 * 没身份或没界 → 照旧拦死 identify_not_living。
 *
 * 翻盘收敛（2026-09-10 拍板，议题3）：代码凭关键词推翻模型结论，只在模型
 * 「错得很离谱」时才允许。模型若已给出界（kingdom 非空），说明它认定主体是真
 * 生物，此时禁止翻盘——这与 prompt 契约一致（不合格时 taxonomy 各级为 null）。
 */
export function evaluateEligibility(result: IdentifyResult): EligibilityDecision {
  let kind = result.subject_kind;
  let eligibility = result.eligibility;
  const kingdomLa = result.taxonomy.kingdom?.name_la?.trim() ?? "";

  if (looksHuman(result)) {
    kind = "human";
    eligibility = "not_collectible";
  }

  const collectible = eligibility === "collectible" && kind === "living_organism";

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
