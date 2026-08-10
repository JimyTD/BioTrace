/**
 * GBIF taxonomy resolve for volumes (hits network).
 *   pnpm --filter @biotrace/api volumes:resolve-smoke
 */
import { emptyTaxonomy } from "../src/identify/types.ts";
import { loadVolumeConfigs } from "../src/volumes/load.ts";
import { slotMatches } from "../src/volumes/match.ts";
import {
  isAcceptedGbifMatch,
  mergeGbifIntoTaxonomy,
  normalizeScientificQuery,
  resolveTaxonomyForVolumes,
  titleCaseScientificToken,
} from "../src/volumes/taxonomy-resolve.ts";

let fail = 0;
function check(name, ok) {
  console.log(`${ok ? "OK" : "FAIL"} ${name}`);
  if (!ok) fail += 1;
}

check("titleCase family", titleCaseScientificToken("portunidae") === "Portunidae");
check(
  "normalize binomial",
  normalizeScientificQuery("eriocheir SINENSS") === "Eriocheir sinenss",
);

const merged = mergeGbifIntoTaxonomy(emptyTaxonomy(), {
  usageKey: 1,
  matchType: "FUZZY",
  confidence: 96,
  canonicalName: "Eriocheir sinensis",
  rank: "SPECIES",
  kingdom: "Animalia",
  phylum: "Arthropoda",
  class: "Malacostraca",
  order: "Decapoda",
  family: "Varunidae",
  genus: "Eriocheir",
  species: "Eriocheir sinensis",
});
check("merge family", merged.family.name_la === "Varunidae");
check(
  "reject NONE",
  !isAcceptedGbifMatch({
    usageKey: null,
    matchType: "NONE",
    confidence: 100,
    canonicalName: null,
    rank: null,
    kingdom: null,
    phylum: null,
    class: null,
    order: null,
    family: null,
    genus: null,
    species: null,
  }),
);

const typo = emptyTaxonomy();
// Misspelled / wrong family would miss the slot list; species typo still anchors via GBIF.
typo.family = { name_la: "Grapsida", name_zh: null };
typo.genus = { name_la: "Eriocher", name_zh: null };
typo.species = { name_la: "Eriocher sinenss", name_zh: null };

const { taxonomy, meta } = await resolveTaxonomyForVolumes({
  taxonomy: typo,
  scientificName: "Eriocher sinenss",
  finestReliableRank: "species",
});

check(`resolve source gbif (got ${meta.source})`, meta.source === "gbif");
check(
  `resolved family Varunidae (got ${taxonomy?.family?.name_la})`,
  taxonomy?.family?.name_la === "Varunidae",
);

const vols = loadVolumeConfigs(true);
const intertidal = vols.find((v) => v.id === "intertidal");
const shore = intertidal?.slots.find((s) => s.id === "shore_crab");
if (!shore) {
  console.error("FAIL missing intertidal/shore_crab");
  process.exit(1);
}

const litRaw = slotMatches({
  rule: shore.rule,
  taxonomy: typo,
  finestReliableRank: "species",
});
const litResolved = slotMatches({
  rule: shore.rule,
  taxonomy,
  finestReliableRank: "species",
});
check("typo raw misses shore_crab", litRaw === false);
check("resolved lights shore_crab", litResolved === true);
console.log(`  raw=${litRaw} resolved=${litResolved} meta=${JSON.stringify(meta)}`);

process.exit(fail ? 1 : 0);
