import { TAXONOMY_RANKS, type Taxonomy, type TaxonomyRank } from "../identify/types.js";
import type { VolumeSlotRule } from "./types.js";

const RANK_INDEX: Record<string, number> = Object.fromEntries(
  TAXONOMY_RANKS.map((r, i) => [r, i]),
);

function normalizeRank(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** True if observation finest rank is at least as fine as required. */
export function rankAtLeast(
  finestReliableRank: string | null | undefined,
  minReliableRank: string,
): boolean {
  const got = normalizeRank(finestReliableRank);
  const need = normalizeRank(minReliableRank);
  const gi = RANK_INDEX[got];
  const ni = RANK_INDEX[need];
  if (gi == null || ni == null) return false;
  return gi >= ni;
}

export function slotMatches(input: {
  rule: VolumeSlotRule;
  taxonomy: Taxonomy | null;
  finestReliableRank?: string | null;
}): boolean {
  const { rule } = input;
  if (rule.type !== "taxonomy_in") return false;
  if (!rankAtLeast(input.finestReliableRank, rule.minReliableRank)) return false;
  if (!input.taxonomy) return false;
  const rank = normalizeRank(rule.rank) as TaxonomyRank;
  if (!(TAXONOMY_RANKS as readonly string[]).includes(rank)) return false;
  const la = input.taxonomy[rank]?.name_la?.trim().toLowerCase();
  if (!la) return false;
  const allowed = new Set(rule.names.map((n) => n.trim().toLowerCase()).filter(Boolean));
  return allowed.has(la);
}
