import { env } from "../env.js";
import {
  TAXONOMY_RANKS,
  emptyTaxonomy,
  type Taxonomy,
  type TaxonomyRank,
} from "../identify/types.js";
import { gbifMatchName, type GbifMatchResult } from "../rarity/gbif.js";

const RANK_INDEX: Record<string, number> = Object.fromEntries(
  TAXONOMY_RANKS.map((r, i) => [r, i]),
);

/** GBIF already rejects below ~80; keep the same floor client-side. */
const MIN_CONFIDENCE = 80;

function normalizeRank(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** GBIF higher-rank match is case-sensitive on all-lowercase (`portunidae` → NONE). */
export function titleCaseScientificToken(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function normalizeScientificQuery(raw: string): string {
  const parts = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return titleCaseScientificToken(parts[0]!);
  const genus = titleCaseScientificToken(parts[0]!);
  const rest = parts.slice(1).map((p) => p.toLowerCase());
  return [genus, ...rest].join(" ");
}

function laAt(tax: Taxonomy, rank: TaxonomyRank): string | null {
  const v = tax[rank]?.name_la?.trim();
  return v || null;
}

function rankAtMostFineAs(
  candidate: TaxonomyRank,
  finestReliableRank: string | null | undefined,
): boolean {
  const finest = normalizeRank(finestReliableRank);
  const fi = RANK_INDEX[finest];
  const ci = RANK_INDEX[candidate];
  if (fi == null || ci == null) return false;
  return ci <= fi;
}

function speciesBinomial(tax: Taxonomy, scientificName?: string | null): string | null {
  const speciesLa = laAt(tax, "species");
  if (speciesLa && speciesLa.includes(" ")) return normalizeScientificQuery(speciesLa);

  const genus = laAt(tax, "genus");
  if (genus && speciesLa && !speciesLa.includes(" ")) {
    return normalizeScientificQuery(`${genus} ${speciesLa}`);
  }

  const sci = scientificName?.trim();
  if (sci) {
    const parts = sci.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return normalizeScientificQuery(`${parts[0]} ${parts[1]}`);
  }
  return null;
}

export function isAcceptedGbifMatch(m: GbifMatchResult): boolean {
  if (m.matchType === "NONE") return false;
  if (m.usageKey == null) return false;
  if (m.confidence < MIN_CONFIDENCE) return false;
  return m.matchType === "EXACT" || m.matchType === "FUZZY" || m.matchType === "HIGHERRANK";
}

/** Overlay GBIF backbone ranks onto a copy; keep original zh labels. */
export function mergeGbifIntoTaxonomy(base: Taxonomy, match: GbifMatchResult): Taxonomy {
  const out = emptyTaxonomy();
  for (const rank of TAXONOMY_RANKS) {
    out[rank] = {
      name_la: base[rank]?.name_la ?? null,
      name_zh: base[rank]?.name_zh ?? null,
    };
  }
  const overlay: Partial<Record<TaxonomyRank, string | null>> = {
    kingdom: match.kingdom,
    phylum: match.phylum,
    class: match.class,
    order: match.order,
    family: match.family,
    genus: match.genus,
    species: match.species ?? match.canonicalName,
  };
  for (const rank of TAXONOMY_RANKS) {
    const la = overlay[rank]?.trim();
    if (la) out[rank] = { name_la: la, name_zh: out[rank].name_zh };
  }
  return out;
}

type ResolveAttempt = {
  name: string;
  rank: TaxonomyRank;
};

function buildAttempts(
  tax: Taxonomy,
  scientificName: string | null | undefined,
  finestReliableRank: string | null | undefined,
): ResolveAttempt[] {
  const attempts: ResolveAttempt[] = [];
  const binomial = speciesBinomial(tax, scientificName);
  if (binomial && rankAtMostFineAs("species", finestReliableRank)) {
    attempts.push({ name: binomial, rank: "species" });
  }
  for (const rank of ["genus", "family", "order"] as const) {
    if (!rankAtMostFineAs(rank, finestReliableRank)) continue;
    const la = laAt(tax, rank);
    if (!la) continue;
    attempts.push({ name: normalizeScientificQuery(la), rank });
  }
  // de-dupe by name+rank
  const seen = new Set<string>();
  return attempts.filter((a) => {
    const key = `${a.rank}|${a.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type TaxonomyResolveMeta = {
  source: "gbif" | "raw" | "disabled" | "error";
  matchedName?: string;
  matchType?: string;
  confidence?: number;
  usageKey?: number;
};

/**
 * Anchor AI taxonomy to GBIF backbone for volume slot matching.
 * Does not mutate stored observation taxonomy — callers use the return value only.
 */
export async function resolveTaxonomyForVolumes(opts: {
  taxonomy: Taxonomy | null;
  scientificName?: string | null;
  finestReliableRank?: string | null;
}): Promise<{ taxonomy: Taxonomy | null; meta: TaxonomyResolveMeta }> {
  const base = opts.taxonomy;
  if (!base) return { taxonomy: null, meta: { source: "raw" } };
  if (!env.gbifEnabled) return { taxonomy: base, meta: { source: "disabled" } };

  const attempts = buildAttempts(base, opts.scientificName, opts.finestReliableRank);
  if (attempts.length === 0) return { taxonomy: base, meta: { source: "raw" } };

  // Do NOT pass AI higher taxonomy as match context: a wrong family (common) can veto
  // an otherwise good FUZZY species hit (e.g. family=Grapsida + Eriocher sinenss → NONE).
  try {
    for (const attempt of attempts) {
      const match = await gbifMatchName({
        name: attempt.name,
        rank: attempt.rank,
      });
      if (!isAcceptedGbifMatch(match)) continue;
      return {
        taxonomy: mergeGbifIntoTaxonomy(base, match),
        meta: {
          source: "gbif",
          matchedName: match.canonicalName ?? attempt.name,
          matchType: match.matchType,
          confidence: match.confidence,
          usageKey: match.usageKey ?? undefined,
        },
      };
    }
  } catch (err) {
    console.warn(
      "[volumes] GBIF taxonomy resolve failed:",
      err instanceof Error ? err.message : err,
    );
    return { taxonomy: base, meta: { source: "error" } };
  }

  return { taxonomy: base, meta: { source: "raw" } };
}
