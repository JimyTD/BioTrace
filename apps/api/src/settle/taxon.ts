import { TAXONOMY_RANKS, normalizeTaxonomy, type Taxonomy, type TaxonomyRank } from "../identify/types.js";

export function parseTaxonomy(json: string | null | undefined): Taxonomy | null {
  if (!json) return null;
  try {
    return normalizeTaxonomy(JSON.parse(json));
  } catch {
    return null;
  }
}

function normalizeRank(rank: string | null | undefined): string {
  return (rank ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const RANK_ALIASES: Record<string, TaxonomyRank> = {
  kingdom: "kingdom",
  phylum: "phylum",
  class: "class",
  order: "order",
  family: "family",
  genus: "genus",
  species: "species",
  subspecies: "species",
  subfamily: "family",
  superfamily: "family",
  tribe: "family",
  界: "kingdom",
  门: "phylum",
  纲: "class",
  目: "order",
  科: "family",
  属: "genus",
  种: "species",
  亚种: "species",
  亚科: "family",
  总科: "family",
  族: "family",
};

/** Key for rarity/collection = taxon at finest_reliable_rank (e.g. family → Tipulidae). */
export function buildTaxonKey(opts: {
  scientificName?: string | null;
  taxonomyJson?: string | null;
  taxonomy?: Taxonomy | null;
  finestReliableRank?: string | null;
}): string | null {
  const tax = opts.taxonomy ?? parseTaxonomy(opts.taxonomyJson);
  const rankKey = RANK_ALIASES[normalizeRank(opts.finestReliableRank)];

  if (tax && rankKey) {
    const atRank = tax[rankKey]?.name_la?.trim();
    if (atRank) return atRank;
  }

  // Fallback: walk from fine to coarse
  if (tax) {
    for (const rank of [...TAXONOMY_RANKS].reverse()) {
      const name = tax[rank]?.name_la?.trim();
      if (name) return name;
    }
  }

  const sci = opts.scientificName?.trim();
  if (sci) {
    const parts = sci.split(/\s+/);
    if (rankKey === "species" && parts.length >= 2 && /^[A-Z]/.test(parts[0])) {
      return `${parts[0]} ${parts[1]}`;
    }
    return sci;
  }
  return null;
}
