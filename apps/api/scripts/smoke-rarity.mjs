/**
 * Offline smoke for rarity grading (no network).
 *   node scripts/smoke-rarity.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(root, "data/rarity-thresholds.json"), "utf8"));

function grade(count, band, global = false) {
  const mult = global ? cfg.globalMultiplier : 1;
  const table = cfg.byRankBand[band];
  for (const tier of cfg.tiers) {
    const bound = table[tier];
    if (bound.maxExclusive == null) return tier;
    if (count < bound.maxExclusive * mult) return tier;
  }
  return cfg.tiers[cfg.tiers.length - 1];
}

const cases = [
  ["species", 10, "LR"],
  ["species", 50, "UR"],
  ["species", 300, "SSR"],
  ["species", 1000, "SR"],
  ["species", 5000, "R"],
  ["species", 25000, "N"],
  ["family", 838, "SSR"], // Tipulidae CN-ish
  ["genus", 500, "SSR"],
  ["genus", 2000, "SR"],
];

let failed = 0;
for (const [band, count, expect] of cases) {
  const got = grade(count, band, false);
  const ok = got === expect;
  if (!ok) failed++;
  console.log(`${ok ? "OK" : "FAIL"} ${band} count=${count} → ${got} (want ${expect})`);
}
if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll grade smokes passed. tiers=", cfg.tiers.join(","));
