import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rarityConfig } from "./config.js";

export type ProtectionLevel = "none" | "uncertain" | "you" | "class_ii" | "class_i";

export type EncounterInput = {
  /** 0–5 encounter frequency for an ordinary traveler — primary rarity signal. */
  frequency: number;
  /** Extinct / no reachable wild population → XR gate. */
  extinct?: boolean;
  /** Aversive pest or roadside weed → locked at N. */
  pestOrWeed?: boolean;
  /** 0–3: how much an ordinary traveller wants this shot */
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
  frequency: number;
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
  frequencyBaseTier: Record<string, string>;
  swarmDownshiftMin: number;
  offset: OffsetConfig;
};

/** Protection level informs the model's frequency call; it no longer adds score locally. */
const DEFAULT_OFFSET: OffsetConfig = {
  weightIconic: 1.2,
  weightProtection: 0,
  weightSwarm: -0.7,
  // Weights follow from what each axis is allowed to do, not from fitting hit counts:
  // appeal 2 alone lifts a tier (2.4 ≥ 2.0) while appeal 1 alone does not (1.2);
  // max hard alone stays short (1.5) but appeal 1 + hard 3 clears it (2.7);
  // max swarm alone drops a tier (−2.1) while swarm 2 does not (−1.4).
  weightHardPhoto: 0.5,
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
    // N is produced only by the pest/weed gate, so the frequency floor is R.
    frequencyBaseTier: {
      "0": "R",
      "1": "R",
      "2": "SR",
      "3": "SSR",
      "4": "UR",
      "5": "LR",
    },
    swarmDownshiftMin: 2.2,
    offset: DEFAULT_OFFSET,
  };
  try {
    const file = JSON.parse(
      readFileSync(join(rarityConfig.dataRoot, "rarity-score-config.json"), "utf8"),
    ) as Partial<ClassScoreConfig> & { offset?: Partial<OffsetConfig> };
    return {
      tiers: file.tiers?.length ? file.tiers : fallback.tiers,
      frequencyBaseTier: { ...fallback.frequencyBaseTier, ...(file.frequencyBaseTier ?? {}) },
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

/** 0–5 frequency; anything unparseable is rejected so the caller can retry the model. */
export function parseFrequency(raw: unknown): number | null {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 5) return null;
  return rounded;
}

export function parseBoolFlag(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  return /^(1|true|yes|y|是)$/i.test(String(raw ?? "").trim());
}

/**
 * The extinct flag alone opens the only door to XR, and the model will reach for
 * "功能性灭绝" to justify any species it finds very rare — that labelled a living
 * class-II mustelid (黄喉貂) extinct. So demand a concrete year as well: inventing
 * one is a far higher bar than reaching for the phrase.
 */
export function parseExtinctFlag(raw: unknown, year: unknown): boolean {
  if (!parseBoolFlag(raw)) return false;
  const n = Math.round(Number(String(year ?? "").trim()));
  return Number.isFinite(n) && n >= 1500 && n <= new Date().getFullYear();
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
  return Math.round(clamp(Number(raw ?? 0), 0, 3));
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
 * Frequency 0–5 sets the base tier; weighted axes → Δ∈{-1,0,+1}.
 * - extinct → XR (the only path to XR)
 * - pest / weed → locked at N
 * - top frequency + habituated swarm → base capped to UR before Δ
 */
export function resolveFromEncounter(input: EncounterInput): EncounterResolution {
  const adjustments: string[] = [];
  const frequency = clamp(Math.round(Number(input.frequency ?? 0)), 0, 5);
  const iconic = parseIconicAppeal(input.iconicAppeal);
  const swarm = parseSwarm(input.swarmOrHabituated);
  const hard = parseHardToPhotograph(input.hardToPhotograph);
  const prot = parseProtectionLevel(input.protectionLevel);

  if (input.extinct) {
    return {
      rarity: "XR",
      baseTier: "XR",
      frequency,
      adjustments: ["gate:extinct"],
      offsetScore: 0,
      offsetDelta: 0,
    };
  }

  if (input.pestOrWeed) {
    return {
      rarity: "N",
      baseTier: "N",
      frequency,
      adjustments: ["gate:pest_weed"],
      offsetScore: 0,
      offsetDelta: 0,
    };
  }

  let baseTier = rarityScoreConfig.frequencyBaseTier[String(frequency)] ?? "R";

  // Habituated swarms cannot sit at the top tier — cap before offset.
  if (frequency >= 5 && swarm >= rarityScoreConfig.swarmDownshiftMin) {
    baseTier = "UR";
    adjustments.push("cap:swarm_blocks_top");
  }

  const { score, delta } = computeOffsetScore({
    iconicAppeal: iconic,
    protectionLevel: prot,
    swarmOrHabituated: swarm,
    hardToPhotograph: hard,
  });

  let tier = shiftTier(baseTier, delta);
  adjustments.push(`offset:S=${score.toFixed(2)};Δ=${delta > 0 ? "+" : ""}${delta}`);

  // XR is reserved for the extinct gate.
  if (tier === "XR") {
    tier = "LR";
    adjustments.push("cap:no_xr_from_offset");
  }

  return {
    rarity: tier,
    baseTier,
    frequency,
    adjustments,
    offsetScore: score,
    offsetDelta: delta,
  };
}
