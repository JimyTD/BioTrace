/**
 * GBIF taxonKey anchoring for settle (hits network).
 *   pnpm --filter @biotrace/api taxonkey:smoke
 */
import { emptyTaxonomy } from "../src/identify/types.ts";
import { buildTaxonKey, resolveTaxonKey } from "../src/settle/taxon.ts";
import {
  canonicalForTaxonKey,
  gbifRankCoversKey,
  isAcceptedGbifMatch,
  mergeGbifIntoTaxonomy,
} from "../src/volumes/taxonomy-resolve.ts";

let fail = 0;
function check(name, ok) {
  console.log(`${ok ? "OK" : "FAIL"} ${name}`);
  if (!ok) fail += 1;
}

check("genus does not cover species", gbifRankCoversKey("GENUS", "species") === false);
check("species covers species", gbifRankCoversKey("SPECIES", "species") === true);
check("subspecies covers species", gbifRankCoversKey("SUBSPECIES", "species") === true);

const synonymMatch = {
  usageKey: 2440957,
  matchType: "EXACT",
  confidence: 98,
  canonicalName: "Cervus albirostris",
  rank: "SPECIES",
  kingdom: "Animalia",
  phylum: "Chordata",
  class: "Mammalia",
  order: "Artiodactyla",
  family: "Cervidae",
  genus: "Przewalskium",
  species: "Przewalskium albirostre",
};
check(
  "synonym taxonKey follows accepted species, not canonicalName",
  canonicalForTaxonKey(synonymMatch, "species") === "Przewalskium albirostre",
);

const higher = {
  usageKey: 1,
  matchType: "HIGHERRANK",
  confidence: 90,
  canonicalName: "Passer",
  rank: "GENUS",
  kingdom: "Animalia",
  phylum: "Chordata",
  class: "Aves",
  order: "Passeriformes",
  family: "Passeridae",
  genus: "Passer",
  species: null,
};
check("HIGHERRANK still accepted for volumes", isAcceptedGbifMatch(higher) === true);
check("HIGHERRANK genus does not cover species key", gbifRankCoversKey(higher.rank, "species") === false);
check("HIGHERRANK genus yields no species taxonKey", canonicalForTaxonKey(higher, "species") === null);
const genusMerged = mergeGbifIntoTaxonomy(emptyTaxonomy(), higher);
check("genus match fills genus, not species", genusMerged.genus.name_la === "Passer" && !genusMerged.species.name_la);
const synMerged = mergeGbifIntoTaxonomy(emptyTaxonomy(), synonymMatch);
check(
  "synonym overlay uses accepted species",
  synMerged.species.name_la === "Przewalskium albirostre",
);

function taxSpecies(la) {
  const t = emptyTaxonomy();
  t.species = { name_la: la, name_zh: null };
  const parts = la.split(/\s+/);
  if (parts[0]) t.genus = { name_la: parts[0], name_zh: null };
  return t;
}

const typo = "Eriocheir sinenss";
const correct = "Eriocheir sinensis";
const typoResolved = await resolveTaxonKey({
  scientificName: typo,
  taxonomy: taxSpecies(typo),
  finestReliableRank: "species",
});
const correctResolved = await resolveTaxonKey({
  scientificName: correct,
  taxonomy: taxSpecies(correct),
  finestReliableRank: "species",
});
const typoKey = typoResolved.taxonKey;
const correctKey = correctResolved.taxonKey;
check(`typo raw Gemini stays ${typo}`, buildTaxonKey({ scientificName: typo, taxonomy: taxSpecies(typo), finestReliableRank: "species" }) === typo);
check(`typo+correct share taxonKey (got ${typoKey} / ${correctKey})`, Boolean(typoKey) && typoKey === correctKey);
check(
  `typo accepted taxonomy follows canonical (got ${typoResolved.acceptedTaxonomy?.species?.name_la})`,
  !typoResolved.acceptedTaxonomy || typoResolved.acceptedTaxonomy.species.name_la === correctKey,
);

const cervusResolved = await resolveTaxonKey({
  scientificName: "Cervus albirostris",
  taxonomy: taxSpecies("Cervus albirostris"),
  finestReliableRank: "species",
});
const przewResolved = await resolveTaxonKey({
  scientificName: "Przewalskium albirostris",
  taxonomy: taxSpecies("Przewalskium albirostris"),
  finestReliableRank: "species",
});
const cervus = cervusResolved.taxonKey;
const przew = przewResolved.taxonKey;
check(`synonyms share taxonKey (got ${cervus} / ${przew})`, Boolean(cervus) && cervus === przew);

function taxGenus(la) {
  const t = emptyTaxonomy();
  t.genus = { name_la: la, name_zh: null };
  return t;
}

const passerGenusResolved = await resolveTaxonKey({
  scientificName: "Passer",
  taxonomy: taxGenus("Passer"),
  finestReliableRank: "genus",
});
const passerSpeciesResolved = await resolveTaxonKey({
  scientificName: "Passer montanus",
  taxonomy: taxSpecies("Passer montanus"),
  finestReliableRank: "species",
});
const passerGenus = passerGenusResolved.taxonKey;
const passerSpecies = passerSpeciesResolved.taxonKey;
check(
  `Passer vs Passer montanus stay split (got ${passerGenus} / ${passerSpecies})`,
  Boolean(passerGenus) && Boolean(passerSpecies) && passerGenus !== passerSpecies,
);

process.exit(fail ? 1 : 0);
