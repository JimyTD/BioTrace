/**
 * Volume engine smoke (no DB / no network): config load + slot match.
 *   pnpm exec tsx scripts/smoke-volumes.mjs
 */
import { emptyTaxonomy } from "../src/identify/types.ts";
import { loadVolumeConfigs } from "../src/volumes/load.ts";
import { slotMatches } from "../src/volumes/match.ts";

const vols = loadVolumeConfigs(true);
console.log(`loaded volumes: ${vols.map((v) => v.id).join(", ") || "(none)"}`);

const urban = vols.find((v) => v.id === "urban_wild");
const intertidal = vols.find((v) => v.id === "intertidal");
const woodland = vols.find((v) => v.id === "woodland_edge");
if (!urban || !intertidal || !woodland) {
  console.error("FAIL missing urban_wild / intertidal / woodland_edge");
  process.exit(1);
}

const songbird = urban.slots.find((s) => s.id === "songbird");
const shore = intertidal.slots.find((s) => s.id === "shore_crab");
const echinoderm = intertidal.slots.find((s) => s.id === "echinoderm");
const squirrel = woodland.slots.find((s) => s.id === "squirrel");
if (!songbird || !shore || !echinoderm || !squirrel) {
  console.error("FAIL missing expected slots");
  process.exit(1);
}

const bird = emptyTaxonomy();
bird.order = { name_la: "Passeriformes", name_zh: null };
bird.family = { name_la: "Passeridae", name_zh: null };

const crab = emptyTaxonomy();
crab.order = { name_la: "Decapoda", name_zh: null };
crab.family = { name_la: "Varunidae", name_zh: null };

const star = emptyTaxonomy();
star.class = { name_la: "Asteroidea", name_zh: null };
star.order = { name_la: "Forcipulatida", name_zh: null };

const squirrelTax = emptyTaxonomy();
squirrelTax.family = { name_la: "Sciuridae", name_zh: null };
squirrelTax.genus = { name_la: "Callosciurus", name_zh: null };

const cases = [
  {
    name: "sparrow lights songbird",
    ok: slotMatches({
      rule: songbird.rule,
      taxonomy: bird,
      finestReliableRank: "species",
    }),
    expect: true,
  },
  {
    name: "sparrow does not light shore_crab",
    ok: slotMatches({
      rule: shore.rule,
      taxonomy: bird,
      finestReliableRank: "species",
    }),
    expect: false,
  },
  {
    name: "varunid lights shore_crab",
    ok: slotMatches({
      rule: shore.rule,
      taxonomy: crab,
      finestReliableRank: "family",
    }),
    expect: true,
  },
  {
    name: "asteroidea lights echinoderm",
    ok: slotMatches({
      rule: echinoderm.rule,
      taxonomy: star,
      finestReliableRank: "class",
    }),
    expect: true,
  },
  {
    name: "sciuridae lights squirrel",
    ok: slotMatches({
      rule: squirrel.rule,
      taxonomy: squirrelTax,
      finestReliableRank: "family",
    }),
    expect: true,
  },
  {
    name: "too-coarse rank does not light songbird",
    ok: slotMatches({
      rule: songbird.rule,
      taxonomy: bird,
      finestReliableRank: "class",
    }),
    expect: false,
  },
];

let fail = 0;
for (const c of cases) {
  const pass = c.ok === c.expect;
  console.log(`${pass ? "OK" : "FAIL"} ${c.name} → ${c.ok}`);
  if (!pass) fail += 1;
}

console.log(
  `slot counts: intertidal=${intertidal.slots.length} urban=${urban.slots.length} woodland=${woodland.slots.length}`,
);
process.exit(fail ? 1 : 0);
