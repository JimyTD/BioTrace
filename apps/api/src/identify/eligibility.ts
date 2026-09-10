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
/**
 * 翻盘留痕（2026-09-10 议题3）：代码凭关键词推翻了模型结论时，记下原判、改判与命中的词。
 * 仅用于诊断与事后复核，不参与判定。
 */
export type EligibilityOverride = {
  from: SubjectKind;
  to: SubjectKind;
  hit: string;
};

/** 识别留影档（2026-09-08 拍板）：没生物 / 生物仅背景 / 分不清 / 人 / 器物。
 * 照片本身就该留在相册——识别不报错、不给稀有度、不进图鉴，仅此而已。
 * 标题走 subject_title_zh（agent 给的短名），识别不出来也不补分类信息。
 */
export type EligibilityKeepsake = {
  kind: SubjectKind;
  reasonZh: string;
  override?: EligibilityOverride | null;
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

/**
 * 器物/影像提示词（2026-09-10 收窄，见 docs/wip/识别链路-议题.md 议题3）。
 *
 * 只用来扫模型给出的「结论性」字段：ineligibility_reason_zh 与 common_name_zh。
 * 不再扫 blurb_zh / notes —— 那是科普描述，天然会提到别的东西
 * （真猫背上趴着个玩具、馆藏标本旁边有模型），拿描述里的词去推翻结论必然误伤。
 *
 * 已移除「布偶」：布偶猫是真实猫品种（apps/api/data/breeds/cat.json），
 * 曾导致家养布偶猫被整只判成工艺品。
 */
const ARTIFACT_HINT =
  /玩具|手办|雕像|塑像|毛绒|公仔|卡通|漫画|动漫|插画|绘本|书页|截图|玩偶/;

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
 * 仅当模型自己判定为活体、但其给出的「结论性文字」里出现器物/影像词时，才推翻。
 *
 * 扫描范围刻意收窄到两个字段：
 *   - ineligibility_reason_zh：模型主动给的不合格理由（最可信的翻盘依据）
 *   - common_name_zh：模型起的中文名（如「毛绒玩具熊」，名字本身就是器物）
 *
 * 刻意不扫 blurb_zh / notes：那两段是科普正文，出现「玩具」「模型」等词
 * 只说明画面里有这些东西，不足以否定「主体是活物」的结论。
 *
 * 注意：common_name_zh 仍需保留扫描，因为「毛绒玩具熊」这类主体名确实落在名字里；
 * 但已移除会误伤真实物种名的词（布偶猫、模型鸟等）。
 */
function looksArtifactOrDepiction(result: IdentifyResult): boolean {
  const hay = `${result.common_name_zh} ${result.ineligibility_reason_zh}`;
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
 *
 * 翻盘收敛（2026-09-10 拍板，议题3）：代码凭关键词推翻模型结论，只在模型
 * 「错得很离谱」时才允许。模型若已给出界（kingdom 非空），说明它认定主体是真
 * 生物，此时禁止翻盘——这与 prompt 契约一致（不合格时 taxonomy 各级为 null）。
 */
export function evaluateEligibility(result: IdentifyResult): EligibilityDecision {
  let kind = result.subject_kind;
  let eligibility = result.eligibility;
  let overridden: EligibilityOverride | null = null;

  const kingdomLa = result.taxonomy.kingdom?.name_la?.trim() ?? "";

  if (looksHuman(result)) {
    kind = "human";
    eligibility = "not_collectible";
  } else if (kind === "living_organism" && looksArtifactOrDepiction(result)) {
    /* 保险 B：模型给了界就不许翻。它已经认定主体是真生物，
       拿一个关键词去推翻它站不住——真要翻，得是模型连界都没给的时候。 */
    if (!kingdomLa) {
      overridden = {
        from: kind,
        to: "artifact_or_toy",
        hit: ARTIFACT_HINT.exec(
          `${result.common_name_zh} ${result.ineligibility_reason_zh}`,
        )?.[0] ?? "",
      };
      kind = "artifact_or_toy";
      eligibility = "not_collectible";
    }
  }

  const collectible = eligibility === "collectible" && kind === "living_organism";

  /* 认不出界：不是错误，归留影（照片仍在相册，只是不进图鉴） */
  if (collectible && !kingdomLa) {
    return {
      ok: true,
      keepsake: {
        kind,
        reasonZh: result.ineligibility_reason_zh.trim() || t("error.identifyGenericFailed"),
        override: overridden,
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
      override: overridden,
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
