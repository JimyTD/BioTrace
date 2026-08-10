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
  "depiction_or_media",
  "no_organism",
  "unclear",
] as const;

export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export type Eligibility = "collectible" | "not_collectible";

export type IdentifyResult = {
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
};

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
