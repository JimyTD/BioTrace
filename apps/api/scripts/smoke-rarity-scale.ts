/**
 * 零成本回归：拿标定跑出来的 12 题答案回放**生产**打分路径，断言算法性质没被改坏。
 * 不调任何模型，不读数据库。改了权重、闸门或名录后跑这个。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/smoke-rarity-scale.ts
 *   node node_modules/tsx/dist/cli.mjs scripts/smoke-rarity-scale.ts --in=latest   # 用 out/ 里最新一轮
 *
 * 默认读入库的固件 `fixtures/rarity-anchors-glm-5.1.json`（2026-08-19 那轮验收的原始记录）。
 * 固件必须入库：`scripts/out/` 被 gitignore，靠它当基准的话换台机器就跑不起来。
 * 别按「out/ 里最新一份」当默认——不同算法版本的记录回放必然失败，选错文件会得到假的 FAIL。
 *
 * 断言两条（这是当初和用户对齐的验收线）：
 *   1. 每个锚点与用户标注相差不超过一档
 *   2. 名录里的灭绝种必须落 XR
 * 注意：回放用的是记录下来的模型答案，因此题面改动不会体现在这里——
 * 题面改动用 scripts/rarity-probe-axis.ts 单题核。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookupCnStatus } from "../src/rarity/cn-status.js";
import {
  collectibleRankFromTier,
  scoreFromScale,
  type ScaleItems,
} from "../src/rarity/scale-rubric.js";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "out");

type Row = {
  id: number;
  label: string;
  taxon: string;
  user?: string;
  agent?: string;
  items: ScaleItems | null;
  model?: string;
  score?: number;
};

const FIXTURE = join(root, "fixtures", "rarity-anchors-glm-5.1.json");

/** 按文件名尾部的时间戳挑最新一轮——文件名以模型名开头，字母序会挑错。 */
function latestCalibrateFile(): string {
  const stampOf = (n: string) => n.match(/(\d{4}-\d{2}-\d{2}T[\d-]+Z)\.json$/)?.[1] ?? "";
  const files = readdirSync(outDir)
    .filter((n) => n.startsWith("rarity-calibrate-") && n.endsWith(".json") && stampOf(n))
    .sort((a, b) => stampOf(a).localeCompare(stampOf(b)));
  const last = files.at(-1);
  if (!last) throw new Error(`${outDir} 里没有标定输出，先跑 rarity-calibrate.ts`);
  return join(outDir, last);
}

function main() {
  const arg = process.argv.find((a) => a.startsWith("--in="))?.slice(5);
  const path = !arg ? FIXTURE : arg === "latest" ? latestCalibrateFile() : arg;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { rows?: Row[] };
  const rows = (parsed.rows ?? []).filter((r) => r.label);
  console.log(`回放 ${rows.length} 个锚点 · ${path.split(/[\\/]/).pop()}\n`);

  let checked = 0;
  let exact = 0;
  const offBy2: string[] = [];
  const extinctMiss: string[] = [];
  const noRef: string[] = [];

  for (const row of rows) {
    const listed = lookupCnStatus(row.taxon, row.label);
    const items = row.items ?? ({} as ScaleItems);
    const got = scoreFromScale(items, {
      sanyou: listed.sanyou,
      extinct: listed.extinct,
      class_i: listed.class_i,
      class_ii: listed.class_ii,
    });

    if (listed.extinct && got.rarity !== "XR") extinctMiss.push(row.label);

    const ref = (row.user ?? "").trim() || (row.agent ?? "").trim();
    if (!ref) {
      noRef.push(row.label);
      continue;
    }
    checked += 1;
    const d = collectibleRankFromTier(got.rarity) - collectibleRankFromTier(ref);
    if (d === 0) exact += 1;
    if (Math.abs(d) >= 2) {
      offBy2.push(`${row.label} 标注 ${ref} 实算 ${got.rarity} (S=${got.score}) 差 ${d} 档`);
    }
  }

  console.log(`有参考 ${checked} 个：命中 ${exact}，≤1 档 ${checked - offBy2.length}`);
  if (noRef.length) console.log(`无参考 ${noRef.length} 个：${noRef.join("、")}`);

  const failures: string[] = [];
  if (offBy2.length) {
    failures.push(`有 ${offBy2.length} 个锚点差两档以上：\n  ${offBy2.join("\n  ")}`);
  }
  if (extinctMiss.length) {
    failures.push(`灭绝名录内的物种没落 XR：${extinctMiss.join("、")}`);
  }

  if (failures.length) {
    console.error(`\nFAIL\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log("\nPASS 全部锚点与标注相差不超过一档，灭绝闸正常。");
}

main();
