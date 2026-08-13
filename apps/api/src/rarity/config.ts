import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";

export type RankBand = "species" | "genus" | "family";

type TierBound = { maxExclusive: number | null };
type ThresholdFile = {
  tiers: string[];
  defaultRarity: string;
  globalMultiplier: number;
  /** If globalCount > countryCount * ratio, treat country as under-sampled. */
  sparseCountryRatio: number;
  byRankBand: Record<RankBand, Record<string, TierBound>>;
};

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), "../../data");

function loadThresholds(): ThresholdFile {
  const fallback: ThresholdFile = {
    tiers: ["LR", "UR", "SSR", "SR", "R", "N"],
    defaultRarity: "R",
    globalMultiplier: 5,
    sparseCountryRatio: 50,
    byRankBand: {
      species: {
        LR: { maxExclusive: 20 },
        UR: { maxExclusive: 100 },
        SSR: { maxExclusive: 500 },
        SR: { maxExclusive: 2000 },
        R: { maxExclusive: 20000 },
        N: { maxExclusive: null },
      },
      genus: {
        LR: { maxExclusive: 50 },
        UR: { maxExclusive: 200 },
        SSR: { maxExclusive: 1000 },
        SR: { maxExclusive: 5000 },
        R: { maxExclusive: 50000 },
        N: { maxExclusive: null },
      },
      family: {
        LR: { maxExclusive: 80 },
        UR: { maxExclusive: 400 },
        SSR: { maxExclusive: 2000 },
        SR: { maxExclusive: 15000 },
        R: { maxExclusive: 120000 },
        N: { maxExclusive: null },
      },
    },
  };
  try {
    return { ...fallback, ...JSON.parse(readFileSync(join(dataRoot, "rarity-thresholds.json"), "utf8")) };
  } catch {
    return fallback;
  }
}

const file = loadThresholds();

export const rarityConfig = {
  tiers: file.tiers,
  defaultRarity: file.defaultRarity || "R",
  globalMultiplier: Number(process.env.RARITY_GLOBAL_MULTIPLIER ?? file.globalMultiplier ?? 5),
  sparseCountryRatio: Number(
    process.env.RARITY_SPARSE_COUNTRY_RATIO ?? file.sparseCountryRatio ?? 50,
  ),
  byRankBand: file.byRankBand,
  gbifEnabled: env.gbifEnabled,
  dataRoot,
};

/** Prefer country count; if CN (etc.) is clearly under-sampled vs GLOBAL, lift with global/mult. */
export function effectiveOccurrenceCount(countryCount: number, globalCount: number): number {
  const ratio = rarityConfig.sparseCountryRatio;
  const sparse = globalCount > countryCount * ratio;
  if (!sparse) return countryCount;
  return Math.max(countryCount, Math.floor(globalCount / rarityConfig.globalMultiplier));
}

export function rankBandFromFinest(rank: string | null | undefined): RankBand {
  const r = (rank ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["species", "subspecies", "种", "亚种"].includes(r)) return "species";
  if (["genus", "属"].includes(r)) return "genus";
  return "family";
}

/**
 * 无国家时与 encounter Prompt 一致回落 CN（产品：中国优先，可无 GPS 开包）。
 * 不再用 GLOBAL 键——避免「键写全球、分按中国」的语义分叉。
 */
export function cacheKey(countryCode: string | null, taxonKey: string): string {
  const cc = countryCode?.trim().toUpperCase() || "CN";
  return `${cc}|${taxonKey}`;
}

/** Higher = rarer (collectible value). Unknown tiers rank as 0. */
export function rarityCollectibleRank(tier: string): number {
  const tiers = rarityConfig.tiers;
  const idx = tiers.indexOf(tier);
  if (idx < 0) return 0;
  return tiers.length - 1 - idx;
}
