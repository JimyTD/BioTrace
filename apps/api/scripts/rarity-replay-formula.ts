/**
 * Replay saved axis scores through current formula (no LLM calls).
 *   pnpm exec tsx scripts/rarity-replay-formula.ts [calibrate-json]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectibleRankFromTier,
  rarityScoreConfig,
  scoreFromAxes,
  tierFromScore,
  type AxisScores,
} from "../src/rarity/formula.js";

const root = dirname(fileURLToPath(import.meta.url));
const input =
  process.argv[2] ||
  join(root, "out", "rarity-calibrate-2026-08-07T02-49-42-862Z.json");

const j = JSON.parse(readFileSync(input, "utf8")) as {
  rows: Array<{
    id: number;
    label: string;
    user: string;
    model: string | null;
    axes?: AxisScores;
    unobtainable?: boolean;
  }>;
};

let exact = 0;
let within1 = 0;
let hi = 0;
let lo = 0;
const rows = [];

for (const r of j.rows) {
  if (!r.axes || !r.model) continue;
  const score = scoreFromAxes(r.axes);
  const tier = tierFromScore(score, Boolean(r.unobtainable), r.axes);
  const dist = Math.abs(collectibleRankFromTier(tier) - collectibleRankFromTier(r.user));
  const dm = collectibleRankFromTier(tier) - collectibleRankFromTier(r.user);
  if (dist === 0) exact += 1;
  if (dist <= 1) within1 += 1;
  if (dm > 0) hi += 1;
  if (dm < 0) lo += 1;
  rows.push({
    id: r.id,
    label: r.label,
    user: r.user,
    old_model: r.model,
    new_model: tier,
    score,
    dist_user: dist,
    delta_vs_old:
      collectibleRankFromTier(tier) - collectibleRankFromTier(r.model),
  });
}

console.log("replay source:", input);
console.log("weights:", rarityScoreConfig.weights);
console.log("bounds:", rarityScoreConfig.bounds);
console.log("lrGate:", rarityScoreConfig.lrGate);
console.log(`exact ${exact}/${rows.length} | within1 ${within1}/${rows.length}`);
console.log(`偏高 ${hi} | 偏低 ${lo}`);
console.log("\nid | label | user | old | new | score | Δuser");
for (const r of rows) {
  const mark = r.dist_user >= 2 ? " **" : r.dist_user === 0 ? " ok" : "";
  console.log(
    `#${r.id} ${r.label}: ${r.user} | ${r.old_model}→${r.new_model} | ${r.score} | Δ${r.dist_user}${mark}`,
  );
}

mkdirSync(join(root, "out"), { recursive: true });
const out = join(root, "out", `rarity-replay-${Date.now()}.json`);
writeFileSync(
  out,
  JSON.stringify(
    {
      source: input,
      config: {
        weights: rarityScoreConfig.weights,
        bounds: rarityScoreConfig.bounds,
        lrGate: rarityScoreConfig.lrGate,
      },
      summary: { exact, within1, n: rows.length, hi, lo },
      rows,
    },
    null,
    2,
  ),
);
console.log("\njson:", out);
