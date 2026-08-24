import { env } from "../env.js";
import { resolveScaleRarity, type ScaleRaritySource } from "./scale.js";

export type RarityResolution = {
  rarity: string;
  source: ScaleRaritySource | "default";
  /** 量表总分；缓存命中或链路不可用时可能为 null。 */
  score?: number | null;
  adjustments?: string[];
  /** 实际出货的模型名，供事后查证某一行是哪档模型判的。 */
  model?: string | null;
};

/**
 * 生产稀有度入口：名录查表 + 12 题原子量表本地加权切档（见 scale.ts）。
 */
export async function resolveRarity(input: {
  taxonKey: string;
  countryCode: string | null;
  finestReliableRank?: string | null;
  /** 额外的 GBIF 名候选（保留调用兼容，量表路径不用）。 */
  matchNames?: string[];
  label?: string | null;
  scientificName?: string | null;
}): Promise<RarityResolution> {
  // 护栏 / 本地测试：识图被 mock 时不真调模型。
  if (env.identifyMock) {
    return {
      rarity: "R",
      source: "default",
      score: null,
      adjustments: ["identify_mock"],
      model: null,
    };
  }

  const resolved = await resolveScaleRarity({
    taxonKey: input.taxonKey,
    countryCode: input.countryCode,
    finestReliableRank: input.finestReliableRank,
    label: input.label,
    scientificName: input.scientificName ?? input.matchNames?.[0] ?? null,
  });
  return {
    rarity: resolved.rarity,
    source: resolved.source,
    score: resolved.score,
    adjustments: resolved.adjustments,
    model: resolved.model,
  };
}

export {
  RARITY_TIERS,
  collectibleRankFromTier,
  rarityFromScore,
  scoreFromScale,
  SCALE_BANDS,
  SCALE_WEIGHTS,
  SCALE_ITEM_KEYS,
  type ScaleItems,
  type ScaleItemKey,
} from "./scale-rubric.js";
export {
  resolveScaleRarity,
  scaleCacheKey,
  parseScaleCacheKey,
  effectiveCountry,
  SCALE_CACHE_VER,
  type ScaleRarityResolution,
} from "./scale.js";
export {
  lookupCnStatus,
  lookupCnProtected,
  lookupListed,
  statusTagsFrom,
  type CnStatus,
  type CnProtectLevel,
  type StatusTag,
} from "./cn-status.js";
