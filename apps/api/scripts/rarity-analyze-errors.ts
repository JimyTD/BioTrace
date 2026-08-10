import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const file =
  process.argv[2] ||
  join(root, "out", "rarity-calibrate-2026-08-07T02-49-42-862Z.json");

const rank: Record<string, number> = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5, XR: 6 };
const j = JSON.parse(readFileSync(file, "utf8")) as {
  generatedAt: string;
  summary: { exact_vs_user: number; within1_vs_user: number; n: number };
  rows: Array<{
    id: number;
    label: string;
    user: string;
    model: string | null;
    dist_user?: number;
    protection_level?: string;
    unobtainable?: boolean;
    axes?: { novelty?: number; habitat_gate?: number; swarm_tame?: number; protection?: number };
  }>;
};

function band(t: string) {
  const i = rank[t] ?? -1;
  if (i <= 1) return "低档(你标N-R)";
  if (i <= 3) return "中档(你标SR-SSR)";
  return "高档(你标UR-LR-XR)";
}

const rows = j.rows.filter((r) => r.model);
const byBand: Record<string, { n: number; exact: number; w1: number; hi: number; lo: number }> = {};
let hi = 0;
let lo = 0;
const big: Array<Record<string, unknown>> = [];

for (const r of rows) {
  const d = r.dist_user ?? Math.abs((rank[r.model!] ?? 0) - (rank[r.user] ?? 0));
  const b = band(r.user);
  byBand[b] ??= { n: 0, exact: 0, w1: 0, hi: 0, lo: 0 };
  byBand[b].n += 1;
  if (d === 0) byBand[b].exact += 1;
  if (d <= 1) byBand[b].w1 += 1;
  const dm = (rank[r.model!] ?? 0) - (rank[r.user] ?? 0);
  if (dm > 0) {
    byBand[b].hi += 1;
    hi += 1;
  }
  if (dm < 0) {
    byBand[b].lo += 1;
    lo += 1;
  }
  if (d >= 2) {
    big.push({
      label: r.label,
      user: r.user,
      model: r.model,
      Δ: d,
      prot: r.protection_level,
      novelty: r.axes?.novelty,
      habitat: r.axes?.habitat_gate,
      swarm: r.axes?.swarm_tame,
      unob: r.unobtainable,
    });
  }
}

console.log("源:", file);
console.log("总览 exact", j.summary.exact_vs_user, "/ within1", j.summary.within1_vs_user, "/", rows.length);
console.log("方向: 模型偏高", hi, "偏低", lo);
console.log("\n按「你标的档位带」:");
for (const [k, v] of Object.entries(byBand)) {
  console.log(
    `  ${k}: n=${v.n} exact=${v.exact} ≤1=${v.w1} 偏高=${v.hi} 偏低=${v.lo}`,
  );
}
console.log("\nΔ≥2 的条目:");
for (const x of big) console.log(" ", JSON.stringify(x));
