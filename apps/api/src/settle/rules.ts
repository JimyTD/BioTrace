import { TAXONOMY_RANKS } from "../identify/types.js";
import { resolveIntroducedAlert } from "../introduced/index.js";
import { resolveRarity } from "../rarity/index.js";
import { resolveCountry, type CountrySource } from "./country.js";
import { buildTaxonKey, parseTaxonomy } from "./taxon.js";

export type SettleTier = "full" | "weak" | "none";

export type SettleComputation = {
  settleTier: SettleTier;
  rarity: string | null;
  countryCode: string | null;
  /** 国别判定来源，仅用于诊断与日后定向重跑，不参与业务逻辑。 */
  countrySource: CountrySource;
  locationPrecise: boolean;
  alertIntroduced: boolean;
  taxonKey: string | null;
};

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

export async function computeSettle(input: {
  lat?: number | null;
  lng?: number | null;
  finestReliableRank?: string | null;
  scientificName?: string | null;
  commonName?: string | null;
  taxonomyJson?: string | null;
}): Promise<SettleComputation> {
  const country = await resolveCountry(input.lat, input.lng);
  const countryCode = country.code;
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
      countrySource: country.source,
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

  // Introduced alert: separate channel from rarity; species-level + country only.
  const intro = resolveIntroducedAlert({
    countryCode,
    finestReliableRank: input.finestReliableRank,
    scientificName: input.scientificName,
    taxonKey,
    matchNames,
  });

  return {
    settleTier,
    rarity: resolved.rarity,
    countryCode,
    countrySource: country.source,
    locationPrecise,
    alertIntroduced: intro.alert,
    taxonKey,
  };
}
