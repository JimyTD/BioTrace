/**
 * Quick introduced-alert regression (no network).
 *   node scripts/smoke-introduced.mjs
 */
import { resolveIntroducedAlert } from "../src/introduced/index.ts";

const cases = [
  {
    name: "红耳龟 CN species → alert",
    input: {
      countryCode: "CN",
      finestReliableRank: "species",
      scientificName: "Trachemys scripta elegans",
    },
    expect: true,
  },
  {
    name: "非洲大蜗牛 CN → alert",
    input: {
      countryCode: "CN",
      finestReliableRank: "species",
      scientificName: "Lissachatina fulica",
    },
    expect: true,
  },
  {
    name: "无国家 → no alert",
    input: {
      countryCode: null,
      finestReliableRank: "species",
      scientificName: "Trachemys scripta",
    },
    expect: false,
  },
  {
    name: "仅科级 → no alert",
    input: {
      countryCode: "CN",
      finestReliableRank: "family",
      scientificName: "Emydidae",
      taxonKey: "Emydidae",
    },
    expect: false,
  },
  {
    name: "本土常见鸟 → no alert",
    input: {
      countryCode: "CN",
      finestReliableRank: "species",
      scientificName: "Passer montanus",
    },
    expect: false,
  },
  {
    name: "清道夫 overlay → alert",
    input: {
      countryCode: "CN",
      finestReliableRank: "species",
      scientificName: "Pterygoplichthys pardalis",
    },
    expect: true,
  },
];

let fail = 0;
for (const c of cases) {
  const got = resolveIntroducedAlert(c.input).alert;
  const ok = got === c.expect;
  console.log(`${ok ? "OK" : "FAIL"} ${c.name} → ${got}`);
  if (!ok) fail += 1;
}
process.exit(fail ? 1 : 0);
