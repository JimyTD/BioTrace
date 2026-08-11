import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rarityConfig } from "./config.js";

/** Traveler encounter bucket — primary rarity signal. */
export type EncounterClass =
  | "pest_weed"
  | "everyday"
  | "place_common"
  | "noteworthy"
  | "scarce"
  | "hard"
  | "legend"
  | "unobtainable";

export type ProtectionLevel = "none" | "uncertain" | "you" | "class_ii" | "class_i";

export type EncounterInput = {
  encounterClass: EncounterClass;
  /** -2…+2: aversion → iconic travel appeal */
  iconicAppeal?: number;
  /** 0–3: swarming / tourist-habituated */
  swarmOrHabituated?: number;
  protectionLevel?: ProtectionLevel | string;
  /** 0–3: harder to find/photograph → positive offset */
  hardToPhotograph?: number | boolean;
};

export type EncounterResolution = {
  rarity: string;
  baseTier: string;
  encounterClass: EncounterClass;
  adjustments: string[];
  offsetScore: number;
  offsetDelta: -1 | 0 | 1;
};

export type OffsetConfig = {
  weightIconic: number;
  weightProtection: number;
  weightSwarm: number;
  weightHardPhoto: number;
  thresholdUp: number;
  thresholdDown: number;
  protectionScore: Record<string, number>;
};

export type ClassScoreConfig = {
  tiers: string[];
  classBaseTier: Record<string, string>;
  vetoClasses: string[];
  swarmDownshiftMin: number;
  offset: OffsetConfig;
};

const ENCOUNTER_CLASSES: EncounterClass[] = [
  "pest_weed",
  "everyday",
  "place_common",
  "noteworthy",
  "scarce",
  "hard",
  "legend",
  "unobtainable",
];

const DEFAULT_OFFSET: OffsetConfig = {
  weightIconic: 1.2,
  weightProtection: 1.0,
  weightSwarm: -0.4,
  weightHardPhoto: 0.7,
  thresholdUp: 2.0,
  thresholdDown: -2.0,
  protectionScore: {
    none: 0,
    uncertain: 0,
    you: 1,
    class_ii: 1.5,
    class_i: 2,
  },
};

function loadScoreConfig(): ClassScoreConfig {
  const fallback: ClassScoreConfig = {
    tiers: ["XR", "LR", "UR", "SSR", "SR", "R", "N"],
    classBaseTier: {
      pest_weed: "N",
      everyday: "N",
      place_common: "R",
      noteworthy: "SR",
      scarce: "SSR",
      hard: "UR",
      legend: "LR",
      unobtainable: "XR",
    },
    vetoClasses: ["pest_weed", "unobtainable"],
    swarmDownshiftMin: 2.2,
    offset: DEFAULT_OFFSET,
  };
  try {
    const file = JSON.parse(
      readFileSync(join(rarityConfig.dataRoot, "rarity-score-config.json"), "utf8"),
    ) as Partial<ClassScoreConfig> & { offset?: Partial<OffsetConfig> };
    return {
      tiers: file.tiers?.length ? file.tiers : fallback.tiers,
      classBaseTier: { ...fallback.classBaseTier, ...(file.classBaseTier ?? {}) },
      vetoClasses: file.vetoClasses?.length ? file.vetoClasses : fallback.vetoClasses,
      swarmDownshiftMin: Number(file.swarmDownshiftMin ?? fallback.swarmDownshiftMin),
      offset: {
        ...DEFAULT_OFFSET,
        ...(file.offset ?? {}),
        protectionScore: {
          ...DEFAULT_OFFSET.protectionScore,
          ...(file.offset?.protectionScore ?? {}),
        },
      },
    };
  } catch {
    return fallback;
  }
}

export const rarityScoreConfig = loadScoreConfig();

export function parseEncounterClass(raw: unknown): EncounterClass | null {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if ((ENCOUNTER_CLASSES as string[]).includes(key)) return key as EncounterClass;
  return null;
}

export function parseProtectionLevel(raw: unknown): ProtectionLevel {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const table: Record<string, ProtectionLevel> = {
    none: "none",
    no: "none",
    无: "none",
    uncertain: "uncertain",
    不确定: "uncertain",
    you: "you",
    san_you: "you",
    三有: "you",
    class_ii: "class_ii",
    ii: "class_ii",
    "2": "class_ii",
    国家二级: "class_ii",
    二级: "class_ii",
    class_i: "class_i",
    i: "class_i",
    "1": "class_i",
    国家一级: "class_i",
    一级: "class_i",
  };
  return table[key] ?? "uncertain";
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}

export function parseIconicAppeal(raw: unknown): number {
  return Math.round(clamp(Number(raw ?? 0), -2, 2));
}

/** Accept 0–3 number, or legacy boolean (true→2, false→0). */
export function parseHardToPhotograph(raw: unknown): number {
  if (typeof raw === "boolean") return raw ? 2 : 0;
  return Math.round(clamp(Number(raw ?? 0), 0, 3));
}

export function parseSwarm(raw: unknown): number {
  return Math.round(clamp(Number(raw ?? 0), 0, 3));
}

/** Collectible rank: higher = rarer. Unknown → 0. */
export function collectibleRankFromTier(tier: string): number {
  const tiers = rarityScoreConfig.tiers.length
    ? rarityScoreConfig.tiers
    : ["XR", "LR", "UR", "SSR", "SR", "R", "N"];
  const idx = tiers.indexOf(tier);
  if (idx < 0) return 0;
  return tiers.length - 1 - idx;
}

function tierByRank(rank: number): string {
  const tiers = rarityScoreConfig.tiers.length
    ? rarityScoreConfig.tiers
    : ["XR", "LR", "UR", "SSR", "SR", "R", "N"];
  const idx = tiers.length - 1 - rank;
  return tiers[Math.max(0, Math.min(tiers.length - 1, idx))] ?? "R";
}

function shiftTier(tier: string, delta: number): string {
  return tierByRank(collectibleRankFromTier(tier) + delta);
}

export function protectionNumeric(level: ProtectionLevel): number {
  const table = rarityScoreConfig.offset.protectionScore;
  return Number(table[level] ?? 0);
}

export function computeOffsetScore(input: {
  iconicAppeal: number;
  protectionLevel: ProtectionLevel;
  swarmOrHabituated: number;
  hardToPhotograph: number;
}): { score: number; delta: -1 | 0 | 1 } {
  const o = rarityScoreConfig.offset;
  const score =
    o.weightIconic * input.iconicAppeal +
    o.weightProtection * protectionNumeric(input.protectionLevel) +
    o.weightSwarm * input.swarmOrHabituated +
    o.weightHardPhoto * input.hardToPhotograph;
  let delta: -1 | 0 | 1 = 0;
  if (score >= o.thresholdUp) delta = 1;
  else if (score <= o.thresholdDown) delta = -1;
  return { score, delta };
}

/**
 * Bucket sets base tier; weighted axes → Δ∈{-1,0,+1}.
 * - unobtainable → XR (ignore Δ)
 * - pest_weed → N base; uplift forbidden
 * - legend + high swarm → base capped to UR before Δ
 * - Δ cannot create XR
 */
export function resolveFromEncounter(input: EncounterInput): EncounterResolution {
  const cls = input.encounterClass;
  const adjustments: string[] = [];
  const iconic = parseIconicAppeal(input.iconicAppeal);
  const swarm = parseSwarm(input.swarmOrHabituated);
  const hard = parseHardToPhotograph(input.hardToPhotograph);
  const prot = parseProtectionLevel(input.protectionLevel);

  if (cls === "unobtainable") {
    return {
      rarity: "XR",
      baseTier: "XR",
      encounterClass: cls,
      adjustments: ["veto:unobtainable"],
      offsetScore: 0,
      offsetDelta: 0,
    };
  }

  let baseTier = rarityScoreConfig.classBaseTier[cls] ?? "R";

  // Habituated swarms cannot stay legend — cap at hard (UR) before offset.
  if (cls === "legend" && swarm >= rarityScoreConfig.swarmDownshiftMin) {
    baseTier = "UR";
    adjustments.push("cap:swarm_blocks_legend");
  }

  const { score, delta: rawDelta } = computeOffsetScore({
    iconicAppeal: iconic,
    protectionLevel: prot,
    swarmOrHabituated: swarm,
    hardToPhotograph: hard,
  });

  let delta = rawDelta;
  if (cls === "pest_weed" && delta > 0) {
    delta = 0;
    adjustments.push("veto:pest_weed_no_up");
  }

  let tier = shiftTier(baseTier, delta);
  if (delta !== 0) {
    adjustments.push(`offset:S=${score.toFixed(2)};Δ=${delta > 0 ? "+" : ""}${delta}`);
  } else {
    adjustments.push(`offset:S=${score.toFixed(2)};Δ=0`);
  }

  // Never promote into XR via adjustments
  if (tier === "XR") {
    tier = "LR";
    adjustments.push("cap:no_xr_from_offset");
  }

  if (cls === "pest_weed") {
    // Keep pest floor at N even if somehow shifted.
    tier = "N";
    adjustments.push("veto:pest_weed");
  }

  return {
    rarity: tier,
    baseTier,
    encounterClass: cls,
    adjustments,
    offsetScore: score,
    offsetDelta: delta,
  };
}
