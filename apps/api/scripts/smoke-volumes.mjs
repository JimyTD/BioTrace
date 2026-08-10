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
if (!urban || !intertidal) {
  console.error("FAIL missing urban_wild / intertidal");
  process.exit(1);
}

const songbird = urban.slots.find((s) => s.id === "songbird");
const shore = intertidal.slots.find((s) => s.id === "shore_crab");
if (!songbird || !shore) {
  console.error("FAIL missing songbird / shore_crab slots");
  process.exit(1);
}

const bird = emptyTaxonomy();
bird.order = { name_la: "Passeriformes", name_zh: "雀形目" };
bird.family = { name_la: "Passeridae", name_zh: null };
bird.genus = { name_la: "Passer", name_zh: null };
bird.species = { name_la: "Passer montanus", name_zh: null };

const crab = emptyTaxonomy();
crab.order = { name_la: "Decapoda", name_zh: null };
crab.family = { name_la: "Varunidae", name_zh: null };
crab.genus = { name_la: "Eriocheir", name_zh: null };
crab.species = { name_la: "Eriocheir sinensis", name_zh: null };

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
    name: "crab lights shore_crab",
    ok: slotMatches({
      rule: shore.rule,
      taxonomy: crab,
      finestReliableRank: "family",
    }),
    expect: true,
  },
  {
    name: "too-coarse rank does not light",
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
process.exit(fail ? 1 : 0);
