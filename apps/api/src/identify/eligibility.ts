import type { IdentifyResult, SubjectKind } from "./types.js";

export type EligibilityErrorCode =
  | "identify_not_organism"
  | "identify_human"
  | "identify_not_living";

export type EligibilityDecision =
  | { ok: true }
  | {
      ok: false;
      code: EligibilityErrorCode;
      kind: SubjectKind;
      reasonZh: string;
    };

const ARTIFACT_HINT =
  /玩具|手办|雕像|塑像|模型|毛绒|公仔|卡通|漫画|动漫|插画|绘本|书页|屏幕|截图|雕像|标本模型|布偶|玩偶/;

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

function codeForKind(kind: SubjectKind): EligibilityErrorCode {
  if (kind === "human") return "identify_human";
  if (kind === "artifact_or_toy" || kind === "depiction_or_media") return "identify_not_living";
  return "identify_not_organism";
}

/**
 * Gate before settle/rarity: only living field organisms may become collectible.
 * Missing/invalid model fields default to not collectible (conservative).
 */
export function evaluateEligibility(result: IdentifyResult): EligibilityDecision {
  let kind = result.subject_kind;
  let living = result.subject_living;
  let eligibility = result.eligibility;

  if (looksHuman(result)) {
    kind = "human";
    living = false;
    eligibility = "not_collectible";
  } else if (kind === "living_organism" && looksArtifactOrDepiction(result)) {
    kind = "artifact_or_toy";
    living = false;
    eligibility = "not_collectible";
  }

  const collectible =
    eligibility === "collectible" && kind === "living_organism" && living === true;

  if (collectible) return { ok: true };

  const reasonZh =
    result.ineligibility_reason_zh.trim() ||
    (kind === "human"
      ? "主体是人类"
      : kind === "artifact_or_toy" || kind === "depiction_or_media"
        ? "像是玩具、模型或影像中的形象，不是现场活体"
        : "图中不像可收集的现场生命观察");

  return {
    ok: false,
    code: codeForKind(kind),
    kind,
    reasonZh,
  };
}

export function isEligibilityErrorCode(code: string | null | undefined): code is EligibilityErrorCode {
  return (
    code === "identify_not_organism" ||
    code === "identify_human" ||
    code === "identify_not_living"
  );
}
