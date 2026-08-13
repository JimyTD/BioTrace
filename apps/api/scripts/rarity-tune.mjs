/**
 * Offline tuner: replay saved calibration axes against candidate formula configs.
 * No model calls — the axes are fixed, only the local mapping/weights vary.
 *
 *   node scripts/rarity-tune.mjs scripts/out/rarity-calibrate-<...>.json
 */
import { readFileSync } from "node:fs";

const TIERS = ["N", "R", "SR", "SSR", "UR", "LR", "XR"];
const rank = (t) => TIERS.indexOf(t);
const BASE_CHOICES = ["R", "SR", "SSR", "UR", "LR"];

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/rarity-tune.mjs <calibrate-output.json>");
  process.exit(1);
}
const { rows } = JSON.parse(readFileSync(file, "utf8"));
const items = rows.filter((r) => r.model && r.encounter_frequency != null);

/** Every non-decreasing mapping of freq 0..5 onto R..LR. */
function* mappings() {
  const pick = (i, min, acc) => {
    if (i === 6) return [acc.slice()];
    const out = [];
    for (let v = min; v < BASE_CHOICES.length; v++) {
      acc.push(v);
      out.push(...pick(i + 1, v, acc));
      acc.pop();
    }
    return out;
  };
  yield* pick(0, 0, []);
}

function resolve(r, cfg) {
  if (r.extinct_or_unobtainable) return "XR";
  if (r.pest_or_weed) return "N";
  const base = rank(BASE_CHOICES[cfg.map[r.encounter_frequency]]);
  const s =
    cfg.wIconic * (r.iconic_appeal ?? 0) +
    cfg.wHard * (r.hard_to_photograph ?? 0) +
    cfg.wSwarm * (r.swarm_or_habituated ?? 0);
  let d = 0;
  if (s >= cfg.up) d = 1;
  else if (s <= -cfg.up) d = -1;
  const capped = Math.min(rank("LR"), Math.max(rank("R"), base + d));
  return TIERS[capped];
}

function score(cfg) {
  let exact = 0;
  let within1 = 0;
  let biasSum = 0;
  let worst = 0;
  for (const r of items) {
    const ref = (r.user || r.agent || "").trim();
    if (!ref) continue;
    const d = rank(resolve(r, cfg)) - rank(ref);
    if (d === 0) exact += 1;
    if (Math.abs(d) <= 1) within1 += 1;
    biasSum += d;
    worst = Math.max(worst, Math.abs(d));
  }
  const n = items.filter((r) => (r.user || r.agent || "").trim()).length;
  return { exact, within1, bias: biasSum / n, worst, n };
}

const grid = [];
for (const map of mappings()) {
  for (const up of [1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4, 2.8]) {
    for (const wIconic of [0.8, 1.0, 1.2]) {
      for (const wHard of [0.3, 0.5, 0.7, 1.0]) {
        for (const wSwarm of [0, -0.4, -0.7]) {
          const cfg = { map, up, wIconic, wHard, wSwarm };
          grid.push({ cfg, ...score(cfg) });
        }
      }
    }
  }
}

grid.sort(
  (a, b) =>
    b.exact - a.exact ||
    b.within1 - a.within1 ||
    Math.abs(a.bias) - Math.abs(b.bias) ||
    a.worst - b.worst,
);

const fmt = (g) =>
  `exact ${g.exact}/${g.n} | ≤1 ${g.within1}/${g.n} | bias ${g.bias >= 0 ? "+" : ""}${g.bias.toFixed(2)} | worst ${g.worst} | map ${g.cfg.map.map((v) => BASE_CHOICES[v]).join(">")} | up=${g.cfg.up} ico=${g.cfg.wIconic} hard=${g.cfg.wHard} swarm=${g.cfg.wSwarm}`;

console.log(`items=${items.length}  configs=${grid.length}`);
console.log("\n=== 最佳 12 组 ===");
for (const g of grid.slice(0, 12)) console.log(fmt(g));

console.log("\n=== 只动阈值（映射与权重保持线上值）===");
for (const up of [1.2, 1.4, 1.6, 1.8, 2.0, 2.4]) {
  const cfg = { map: [0, 0, 1, 2, 3, 4], up, wIconic: 1.2, wHard: 0.7, wSwarm: -0.7 };
  console.log(`up=${up.toFixed(1)}  ${fmt({ cfg, ...score(cfg) })}`);
}

console.log("\n=== 频次取值分布 ===");
const hist = {};
for (const r of items) hist[r.encounter_frequency] = (hist[r.encounter_frequency] ?? 0) + 1;
console.log(
  Object.keys(hist)
    .sort()
    .map((k) => `f${k}:${hist[k]}`)
    .join("  "),
);

console.log("\n=== 当前线上配置 ===");
const current = grid.find(
  (g) =>
    g.cfg.map.join() === [0, 0, 1, 2, 3, 4].join() &&
    g.cfg.up === 2.0 &&
    g.cfg.wIconic === 1.2 &&
    g.cfg.wHard === 0.7 &&
    g.cfg.wSwarm === -0.7,
);
console.log(current ? fmt(current) : "(not in grid)");

console.log("\n=== 最佳配置的逐项明细 ===");
const best = grid[0].cfg;
for (const r of items) {
  const ref = (r.user || r.agent || "").trim();
  const got = resolve(r, best);
  const d = rank(got) - rank(ref);
  const mark = d === 0 ? "  " : d > 0 ? `+${d}` : String(d);
  console.log(
    `${mark} #${String(r.id).padStart(2)} ${r.label.padEnd(12)} ref=${ref.padEnd(3)} → ${got.padEnd(3)} f=${r.encounter_frequency} ico=${r.iconic_appeal} hard=${r.hard_to_photograph} swarm=${r.swarm_or_habituated}`,
  );
}
