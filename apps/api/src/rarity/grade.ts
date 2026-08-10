import { rarityConfig, type RankBand } from "./config.js";

/** Map occurrence count → rarity tier using configurable ordered bounds (UR → … → N). */
export function gradeFromCount(
  count: number,
  band: RankBand,
  opts?: { global?: boolean },
): string {
  const mult = opts?.global ? rarityConfig.globalMultiplier : 1;
  const table = rarityConfig.byRankBand[band] ?? rarityConfig.byRankBand.species;
  const tiers = rarityConfig.tiers.length ? rarityConfig.tiers : ["LR", "UR", "SSR", "SR", "R", "N"];

  for (const tier of tiers) {
    const bound = table[tier];
    if (!bound) continue;
    if (bound.maxExclusive == null) return tier;
    if (count < bound.maxExclusive * mult) return tier;
  }
  return tiers[tiers.length - 1] ?? rarityConfig.defaultRarity;
}
