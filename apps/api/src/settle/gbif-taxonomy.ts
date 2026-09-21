import type { Taxonomy, TaxonomyRank } from "../identify/types.js";
import type { GbifMatchResult } from "../rarity/gbif.js";

/** GBIF higher-rank matching is case-sensitive on all-lowercase scientific names. */
function titleCaseScientificToken(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function normalizeScientificQuery(raw: string): string {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return titleCaseScientificToken(parts[0]!);
  return [
    titleCaseScientificToken(parts[0]!),
    ...parts.slice(1).map((part) => part.toLowerCase()),
  ].join(" ");
}

const MIN_CONFIDENCE = 80;

export function isAcceptedGbifMatch(match: GbifMatchResult): boolean {
  if (match.matchType === "NONE" || match.usageKey == null) return false;
  return match.confidence >= MIN_CONFIDENCE &&
    (match.matchType === "EXACT" || match.matchType === "FUZZY" || match.matchType === "HIGHERRANK");
}

const GBIF_RANK_INDEX: Record<string, number> = {
  kingdom: 0,
  phylum: 1,
  class: 2,
  order: 3,
  family: 4,
  genus: 5,
  species: 6,
  subspecies: 7,
};

function gbifRankIndex(raw: string | null | undefined): number | null {
  const key = (raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return key ? GBIF_RANK_INDEX[key] ?? null : null;
}

/** Match rank is the key rank or finer; a coarser HIGHERRANK match is not usable. */
export function gbifRankCoversKey(
  matchRank: string | null | undefined,
  keyRank: TaxonomyRank,
): boolean {
  const matched = gbifRankIndex(matchRank);
  const key = gbifRankIndex(keyRank);
  return matched != null && key != null && matched >= key;
}

/** Accepted backbone name at the settled taxon key rank. */
export function canonicalForTaxonKey(match: GbifMatchResult, keyRank: TaxonomyRank): string | null {
  if (keyRank === "species") {
    const raw = match.species?.trim() ||
      (gbifRankCoversKey(match.rank, "species") ? match.canonicalName : null);
    if (!raw) return null;
    const parts = normalizeScientificQuery(raw).split(/\s+/).filter(Boolean);
    return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : null;
  }

  const fromField =
    keyRank === "genus" ? match.genus :
    keyRank === "family" ? match.family :
    keyRank === "order" ? match.order :
    keyRank === "class" ? match.class :
    keyRank === "phylum" ? match.phylum :
    keyRank === "kingdom" ? match.kingdom : null;
  const raw = fromField?.trim() ||
    (gbifRankIndex(match.rank) === gbifRankIndex(keyRank) ? match.canonicalName : null);
  return raw ? normalizeScientificQuery(raw) : null;
}

/** Overlay GBIF backbone Latin names while keeping the recognition result's Chinese labels. */
export function mergeGbifIntoTaxonomy(base: Taxonomy, match: GbifMatchResult): Taxonomy {
  const out = {} as Taxonomy;
  const overlay: Partial<Record<TaxonomyRank, string | null | undefined>> = {
    kingdom: match.kingdom,
    phylum: match.phylum,
    class: match.class,
    order: match.order,
    family: match.family,
    genus: match.genus,
    species: match.species?.trim() ||
      (gbifRankCoversKey(match.rank, "species") ? match.canonicalName : null),
  };

  for (const rank of ["kingdom", "phylum", "class", "order", "family", "genus", "species"] as const) {
    const latin = overlay[rank]?.trim();
    out[rank] = {
      name_la: latin || base[rank]?.name_la || null,
      name_zh: base[rank]?.name_zh || null,
    };
  }
  return out;
}
