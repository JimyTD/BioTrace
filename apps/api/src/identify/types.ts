export const TAXONOMY_RANKS = [
  "kingdom",
  "phylum",
  "class",
  "order",
  "family",
  "genus",
  "species",
] as const;

export type TaxonomyRank = (typeof TAXONOMY_RANKS)[number];

export type TaxonomyName = {
  name_la: string | null;
  name_zh: string | null;
};

export type Taxonomy = Record<TaxonomyRank, TaxonomyName>;

export const SUBJECT_KINDS = [
  "living_organism",
  "human",
  "artifact_or_toy",
  "specimen",
  "depiction_or_media",
  "no_organism",
  "unclear",
] as const;

export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export type Eligibility = "collectible" | "not_collectible";

export type IdentifyResult = {
  /**
   * 留影档短标题（识图 agent 输出，一行内）。仅留影档使用；
   * 展示层统一取 subjectTitle ?? commonName ?? scientificName。
   */
  subject_title_zh?: string;
  common_name_zh: string;
  scientific_name: string;
  taxonomy: Taxonomy;
  confidence_0_to_1: number;
  finest_reliable_rank: string;
  blurb_zh: string;
  notes: string;
  subject_kind: SubjectKind;
  subject_living: boolean;
  eligibility: Eligibility;
  ineligibility_reason_zh: string;
  /**
   * 驯化位：true=驯化型本体，false=野生型本体，null=看不出（下游折 wild）。
   * 只认生物本体，项圈/场景不算。
   */
  domesticated: boolean | null;
  /** 标准品种中文名；非驯化或认不出时为 null。不收颜色系俗名。 */
  breed_zh: string | null;
  /** 自报 L1 本体证据，仅审计，不进判卷。 */
  dom_evidence_zh: string | null;
};

/** 落库用：识图 null 折成 wild；非 true 时丢掉品种。 */
export function storedDomIdentity(result: IdentifyResult): {
  domesticated: boolean;
  breedZh: string | null;
  domEvidenceZh: string | null;
} {
  const domesticated = result.domesticated === true;
  const breed = result.breed_zh?.trim() || "";
  const evidence = result.dom_evidence_zh?.trim() || "";
  return {
    domesticated,
    breedZh: domesticated && breed ? breed : null,
    domEvidenceZh: evidence || null,
  };
}

export function normalizeTriBool(raw: unknown): boolean | null {
  if (raw === true || raw === false) return raw;
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "true" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "no" || s === "0") return false;
  return null;
}

export function normalizeOptionalZh(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === "null") return null;
  return s;
}

export type IdentifyInput = {
  imagePath: string;
  mimeType: string;
  lat?: number | null;
  lng?: number | null;
  capturedAt?: Date | null;
  description?: string | null;
};

export function emptyTaxonomy(): Taxonomy {
  return {
    kingdom: { name_la: null, name_zh: null },
    phylum: { name_la: null, name_zh: null },
    class: { name_la: null, name_zh: null },
    order: { name_la: null, name_zh: null },
    family: { name_la: null, name_zh: null },
    genus: { name_la: null, name_zh: null },
    species: { name_la: null, name_zh: null },
  };
}

/** Normalize legacy string ranks + new {name_la,name_zh} objects. */
export function normalizeTaxonomy(raw: unknown): Taxonomy {
  const base = emptyTaxonomy();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const rank of TAXONOMY_RANKS) {
    const v = obj[rank];
    if (v == null) continue;
    if (typeof v === "string") {
      base[rank] = { name_la: v || null, name_zh: null };
    } else if (typeof v === "object") {
      const o = v as { name_la?: unknown; name_zh?: unknown; la?: unknown; zh?: unknown };
      const la = o.name_la ?? o.la;
      const zh = o.name_zh ?? o.zh;
      base[rank] = {
        name_la: typeof la === "string" && la.trim() ? la.trim() : null,
        name_zh: typeof zh === "string" && zh.trim() ? zh.trim() : null,
      };
    }
  }
  return base;
}

export function normalizeSubjectKind(raw: unknown): SubjectKind {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if ((SUBJECT_KINDS as readonly string[]).includes(s)) return s as SubjectKind;
  return "unclear";
}

export function normalizeEligibility(raw: unknown): Eligibility {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (s === "collectible") return "collectible";
  return "not_collectible";
}
