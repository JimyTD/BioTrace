import { env } from "../env.js";
import { resolveEncounterRarity } from "./encounter.js";

export type RarityResolution = {
  rarity: string;
  source: "cache" | "encounter" | "seed" | "default" | "gbif";
  occurrenceCount: number | null;
  gbifUsageKey: number | null;
  encounterClass?: string | null;
  adjustments?: string[];
};

/**
 * Production rarity resolver — encounter_class + veto (not GBIF counts).
 */
export async function resolveRarity(input: {
  taxonKey: string;
  countryCode: string | null;
  finestReliableRank?: string | null;
  /** Extra GBIF name candidates (kept for API compat; unused by encounter path). */
  matchNames?: string[];
  label?: string | null;
  scientificName?: string | null;
}): Promise<RarityResolution> {
  // Guardrail / local tests: skip GLM encounter scoring when vision is mocked.
  if (env.identifyMock) {
    return {
      rarity: "R",
      source: "default",
      occurrenceCount: null,
      gbifUsageKey: null,
      encounterClass: "place_common",
      adjustments: ["identify_mock"],
    };
  }

  const resolved = await resolveEncounterRarity({
    taxonKey: input.taxonKey,
    countryCode: input.countryCode,
    finestReliableRank: input.finestReliableRank,
    label: input.label,
    scientificName: input.scientificName ?? input.matchNames?.[0] ?? null,
  });
  return {
    rarity: resolved.rarity,
    source: resolved.source,
    occurrenceCount: resolved.occurrenceCount,
    gbifUsageKey: resolved.gbifUsageKey,
    encounterClass: resolved.encounterClass,
    adjustments: resolved.adjustments,
  };
}

export { rarityConfig, rankBandFromFinest, rarityCollectibleRank } from "./config.js";
export { gradeFromCount } from "./grade.js";
export {
  resolveFromEncounter,
  parseEncounterClass,
  parseProtectionLevel,
  collectibleRankFromTier,
  type EncounterClass,
  type EncounterInput,
} from "./formula.js";
export { resolveEncounterRarity, scoreEncounterClass } from "./encounter.js";
export { ENCOUNTER_RUBRIC } from "./encounter-rubric.js";
