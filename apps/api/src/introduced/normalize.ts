/** Normalize a scientific name for introduced-list lookup. */
export function normalizeSciName(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    // drop common authorship wrappers / markers
    .replace(/[()]/g, "")
    .replace(/\b(subsp|ssp|var|f|cf|aff)\b\.?/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s;
}

/**
 * Binomial key: genus + specific epithet (first two tokens).
 * Rejects single-token (genus/family) names — alerts require species-level IDs.
 */
export function binomialKey(raw: string | null | undefined): string | null {
  const n = normalizeSciName(raw);
  if (!n) return null;
  const parts = n.split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  // skip hybrid markers etc.
  if (parts[0] === "×" || parts[0] === "x") return null;
  return `${parts[0]} ${parts[1]}`;
}

export function isSpeciesRank(rank: string | null | undefined): boolean {
  const r = (rank ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return ["species", "subspecies", "种", "亚种"].includes(r);
}
