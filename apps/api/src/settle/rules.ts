import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TAXONOMY_RANKS } from "../identify/types.js";
import { resolveRarity } from "../rarity/index.js";
import { countryFromLatLng } from "./country.js";
import { buildTaxonKey, parseTaxonomy } from "./taxon.js";

export type SettleTier = "full" | "weak" | "none";

export type SettleComputation = {
  settleTier: SettleTier;
  rarity: string | null;
  countryCode: string | null;
  locationPrecise: boolean;
  alertIntroduced: boolean;
  taxonKey: string | null;
};

const root = join(dirname(fileURLToPath(import.meta.url)), "../../data");

function loadJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(root, name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

const introducedSeed = loadJson<Record<string, string[]>>("introduced-seed.json", {});

function normalizeRank(rank: string | null | undefined): string {
  return (rank ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function settleTierFromRank(rank: string | null | undefined): SettleTier {
  const r = normalizeRank(rank);
  if (["species", "subspecies", "种", "亚种"].includes(r)) return "full";
  if (["genus", "属"].includes(r)) return "full";
  if (["family", "subfamily", "tribe", "superfamily", "科", "亚科", "族", "总科"].includes(r)) {
    return "weak";
  }
  if (!r) return "none";
  return "none";
}

function matchIntroduced(taxonKey: string | null, scientificName: string | null, countryCode: string): boolean {
  const list = introducedSeed[countryCode];
  if (!list?.length) return false;
  const candidates = [taxonKey, scientificName]
    .filter(Boolean)
    .map((s) => s!.trim().toLowerCase());
  for (const item of list) {
    const n = item.trim().toLowerCase();
    if (candidates.some((c) => c === n || c === n.split(/\s+/)[0])) return true;
  }
  return false;
}

export async function computeSettle(input: {
  lat?: number | null;
  lng?: number | null;
  finestReliableRank?: string | null;
  scientificName?: string | null;
  commonName?: string | null;
  taxonomyJson?: string | null;
}): Promise<SettleComputation> {
  const countryCode = countryFromLatLng(input.lat, input.lng);
  const locationPrecise = Boolean(countryCode);
  const settleTier = settleTierFromRank(input.finestReliableRank);
  const taxonomy = parseTaxonomy(input.taxonomyJson);
  const taxonKey = buildTaxonKey({
    scientificName: input.scientificName,
    taxonomy,
    finestReliableRank: input.finestReliableRank,
  });

  if (settleTier === "none") {
    return {
      settleTier,
      rarity: null,
      countryCode,
      locationPrecise,
      alertIntroduced: false,
      taxonKey,
    };
  }

  // Rarity follows the reliable-rank taxon only — weak settle does NOT downgrade.
  // Primary path: encounter_class + veto (GLM), not GBIF counts.
  const matchNames: string[] = [];
  if (input.scientificName?.trim()) matchNames.push(input.scientificName.trim());
  if (taxonomy) {
    for (const rank of [...TAXONOMY_RANKS].reverse()) {
      const n = taxonomy[rank]?.name_la?.trim();
      if (n) matchNames.push(n);
    }
  }

  const resolved = taxonKey
    ? await resolveRarity({
        taxonKey,
        countryCode,
        finestReliableRank: input.finestReliableRank,
        matchNames,
        label: input.commonName?.trim() || input.scientificName?.trim() || taxonKey,
        scientificName: input.scientificName,
      })
    : { rarity: "R" as const };

  const alertIntroduced =
    Boolean(countryCode) &&
    matchIntroduced(taxonKey, input.scientificName ?? null, countryCode!);

  return {
    settleTier,
    rarity: resolved.rarity,
    countryCode,
    locationPrecise,
    alertIntroduced,
    taxonKey,
  };
}
