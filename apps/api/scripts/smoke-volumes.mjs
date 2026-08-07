/**
 * Volume engine smoke (no DB): config load + slot match.
 *   pnpm exec tsx scripts/smoke-volumes.mjs
 */
import { emptyTaxonomy } from "../src/identify/types.ts";
import { loadVolumeConfigs } from "../src/volumes/load.ts";
import { slotMatches } from "../src/volumes/match.ts";

const vols = loadVolumeConfigs(true);
console.log(`loaded volumes: ${vols.map((v) => v.id).join(", ") || "(none)"}`);

const fixture = vols.find((v) => v.id === "fixture_pipeline");
if (!fixture) {
  console.error("FAIL missing fixture_pipeline");
  process.exit(1);
}

const bird = emptyTaxonomy();
bird.order = { name_la: "Passeriformes", name_zh: "雀形目" };
bird.family = { name_la: "Passeridae", name_zh: null };
bird.genus = { name_la: "Passer", name_zh: null };
bird.species = { name_la: "Passer montanus", name_zh: null };

const turtle = emptyTaxonomy();
turtle.order = { name_la: "Testudines", name_zh: null };
turtle.family = { name_la: "Emydidae", name_zh: null };
turtle.genus = { name_la: "Trachemys", name_zh: null };
turtle.species = { name_la: "Trachemys scripta", name_zh: null };

const passSlot = fixture.slots.find((s) => s.id === "passeriformes");
const testSlot = fixture.slots.find((s) => s.id === "testudines");

const cases = [
  {
    name: "sparrow lights passeriformes",
    ok: slotMatches({
      rule: passSlot.rule,
      taxonomy: bird,
      finestReliableRank: "species",
    }),
    expect: true,
  },
  {
    name: "sparrow does not light testudines",
    ok: slotMatches({
      rule: testSlot.rule,
      taxonomy: bird,
      finestReliableRank: "species",
    }),
    expect: false,
  },
  {
    name: "turtle lights testudines",
    ok: slotMatches({
      rule: testSlot.rule,
      taxonomy: turtle,
      finestReliableRank: "genus",
    }),
    expect: true,
  },
  {
    name: "too-coarse rank does not light",
    ok: slotMatches({
      rule: passSlot.rule,
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
