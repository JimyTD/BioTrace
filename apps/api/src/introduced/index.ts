import { introducedLookup } from "./load.js";
import { binomialKey, isSpeciesRank, normalizeSciName } from "./normalize.js";

export type IntroducedResolution = {
  alert: boolean;
  source: "index" | "none";
  matchedName: string | null;
};

/**
 * Country × taxon introduced/watch alert.
 * - No country → no alert
 * - Only species / subspecies reliable ranks
 * - Exact / binomial match against public index + seed overlay (no genus-only fuzzy)
 */
export function resolveIntroducedAlert(input: {
  countryCode: string | null | undefined;
  finestReliableRank?: string | null;
  scientificName?: string | null;
  taxonKey?: string | null;
  matchNames?: string[];
}): IntroducedResolution {
  const cc = input.countryCode?.trim().toUpperCase();
  if (!cc) return { alert: false, source: "none", matchedName: null };
  if (!isSpeciesRank(input.finestReliableRank)) {
    return { alert: false, source: "none", matchedName: null };
  }

  const set = introducedLookup.get(cc);
  if (!set?.size) return { alert: false, source: "none", matchedName: null };

  const candidates: string[] = [];
  for (const raw of [input.scientificName, input.taxonKey, ...(input.matchNames ?? [])]) {
    const full = normalizeSciName(raw);
    const bin = binomialKey(raw);
    if (full) candidates.push(full);
    if (bin) candidates.push(bin);
  }

  for (const c of candidates) {
    if (set.has(c)) {
      return { alert: true, source: "index", matchedName: c };
    }
  }
  return { alert: false, source: "none", matchedName: null };
}

export { introducedIndexMeta } from "./load.js";
export { isSpeciesRank, binomialKey, normalizeSciName } from "./normalize.js";
