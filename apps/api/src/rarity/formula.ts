import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rarityConfig } from "./config.js";

/** Traveler encounter bucket — primary rarity signal (not a weighted score). */
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
  /** 0–3: swarming / tourist-habituated. High → shift toward commoner. */
  swarmOrHabituated?: number;
  protectionLevel?: ProtectionLevel | string;
  /** Kept for explainability; does NOT raise tier. */
  hardToPhotograph?: boolean;
};

export type EncounterResolution = {
  rarity: string;
  baseTier: string;
  encounterClass: EncounterClass;
  adjustments: string[];
};

export type ClassScoreConfig = {
  tiers: string[];
  classBaseTier: Record<string, string>;
  vetoClasses: string[];
  swarmDownshiftMin: number;
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
    vetoClasses: ["pest_weed", "everyday", "unobtainable"],
    swarmDownshiftMin: 2.2,
  };
  try {
    const file = JSON.parse(
      readFileSync(join(rarityConfig.dataRoot, "rarity-score-config.json"), "utf8"),
    ) as Partial<ClassScoreConfig>;
    return {
      tiers: file.tiers?.length ? file.tiers : fallback.tiers,
      classBaseTier: { ...fallback.classBaseTier, ...(file.classBaseTier ?? {}) },
      vetoClasses: file.vetoClasses?.length ? file.vetoClasses : fallback.vetoClasses,
      swarmDownshiftMin: Number(file.swarmDownshiftMin ?? fallback.swarmDownshiftMin),
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

function clamp01to3(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, n));
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
  // rank 0 = N (last), rank max = XR (first)
  const idx = tiers.length - 1 - rank;
  return tiers[Math.max(0, Math.min(tiers.length - 1, idx))] ?? "R";
}

function shiftTier(tier: string, delta: number): string {
  const rank = collectibleRankFromTier(tier) + delta;
  return tierByRank(rank);
}

/**
 * Priority / veto model (not ax+by+cz):
 * - pest_weed / everyday → force N (ignore photo difficulty, protection boosts)
 * - unobtainable → force XR
 * - else base from class, then at most ±1 from swarm / strong protection
 */
export function resolveFromEncounter(input: EncounterInput): EncounterResolution {
  const cls = input.encounterClass;
  const baseTier = rarityScoreConfig.classBaseTier[cls] ?? "R";
  const adjustments: string[] = [];

  if (cls === "unobtainable") {
    return { rarity: "XR", baseTier: "XR", encounterClass: cls, adjustments: ["veto:unobtainable"] };
  }

  const prot = parseProtectionLevel(input.protectionLevel);
  // pest_weed always N. everyday is N unless protected wildlife (you/class) → R.
  // Principled: "三有/保护常见鸟" keep collectible floor without species lists.
  if (cls === "pest_weed") {
    adjustments.push("veto:pest_weed");
    if (input.hardToPhotograph) adjustments.push("ignore:hard_to_photograph");
    return { rarity: "N", baseTier: "N", encounterClass: cls, adjustments };
  }
  if (cls === "everyday") {
    const protectedWildlife = prot === "you" || prot === "class_ii" || prot === "class_i";
    if (!protectedWildlife) {
      adjustments.push("veto:everyday");
      if (input.hardToPhotograph) adjustments.push("ignore:hard_to_photograph");
      return { rarity: "N", baseTier: "N", encounterClass: cls, adjustments };
    }
    adjustments.push(`up:everyday_protected_${prot}`);
    // Continue as place_common (R) from here.
  }

  let tier = cls === "everyday" ? "R" : baseTier;
  let effectiveBase = tier;
  const swarm = clamp01to3(Number(input.swarmOrHabituated ?? 0));
  // Habituated swarms cannot stay legend — cap at hard (UR).
  if (cls === "legend" && swarm >= rarityScoreConfig.swarmDownshiftMin) {
    tier = "UR";
    effectiveBase = "UR";
    adjustments.push("cap:swarm_blocks_legend");
  } else {
    // Swarm downshift only for scarce+ (keeps place_common at R even if Ligia swarms).
    const canSwarmDown = collectibleRankFromTier(effectiveBase) >= collectibleRankFromTier("SSR");
    if (canSwarmDown && swarm >= rarityScoreConfig.swarmDownshiftMin) {
      tier = shiftTier(tier, -1);
      adjustments.push("down:swarm_or_habituated");
    }
  }

  // Protection may bump noteworthy/scarce only — never hard/legend (avoids macaque→LR).
  const canProtUp = effectiveBase === "SR" || effectiveBase === "SSR";
  if (canProtUp && (prot === "class_ii" || prot === "class_i")) {
    const bumped = shiftTier(tier, 1);
    if (bumped !== tier && bumped !== "XR") {
      tier = bumped;
      adjustments.push(`up:protection_${prot}`);
    }
  }

  // Never promote into XR via adjustments
  if (tier === "XR") tier = "LR";

  return { rarity: tier, baseTier: effectiveBase, encounterClass: cls, adjustments };
}
