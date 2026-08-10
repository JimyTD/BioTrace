/**
 * Score the same taxa 3 times; report per-axis spread.
 *   pnpm exec tsx scripts/rarity-stability.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../src/env.js";
import { normalizeAxes, type AxisScores } from "../src/rarity/formula.js";

type TaxonRow = {
  id: number;
  label: string;
  taxon: string;
  rank: string;
};

const root = dirname(fileURLToPath(import.meta.url));
const taxaPath = join(root, "rarity-calibrate-taxa.json");
const outDir = join(root, "out");
const RUNS = 3;
const AXES = ["habitat_gate", "novelty", "detect_photo", "protection", "swarm_tame"] as const;

/** Subset spanning N → XR; keep small so 3× is affordable. */
const SAMPLE_IDS = [1, 2, 6, 7, 9, 11, 18, 20, 24];

const RUBRIC = `为中国 CN 野生旅行遇见打抽卡价值轴分（0–3）。
轴：habitat_gate, novelty, detect_photo, swarm_tame；
protection_level 只能是 none|uncertain|you|class_ii|class_i；
unobtainable 仅功能灭绝/野外基本不可遇见为 true。
只输出 JSON：
{"habitat_gate":n,"novelty":n,"detect_photo":n,"swarm_tame":n,"protection_level":"...","unobtainable":false,"reason":"..."}`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function zhipuFetchInit(): RequestInit {
  const init: RequestInit = {};
  if (env.httpsProxy) init.dispatcher = new ProxyAgent(env.httpsProxy);
  return init;
}

async function callZhipu(prompt: string): Promise<string> {
  if (!env.zhipuApiKey) throw new Error("ZHIPU_API_KEY missing");
  const model = process.env.ZHIPU_TEXT_MODEL?.trim() || "glm-4-flash";
  const url = `${env.zhipuBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await undiciFetch(url, {
    ...zhipuFetchInit(),
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.zhipuApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: "只输出合法 JSON 对象。" },
        { role: "user", content: prompt },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Zhipu HTTP ${res.status}: ${body.slice(0, 300)}`);
  const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error("empty content");
  return content;
}

function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let raw = (fenced?.[1] ?? text).trim();
  raw = raw.replace(/\bFalse\b/g, "false").replace(/\bTrue\b/g, "true").replace(/\bNone\b/g, "null");
  const start = raw.indexOf("{");
  if (start < 0) throw new Error(`no json: ${text.slice(0, 120)}`);
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`unbalanced json: ${text.slice(0, 120)}`);
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

async function scoreOnce(row: TaxonRow): Promise<AxisScores & { unobtainable: boolean; protection_level: string }> {
  const prompt = `${RUBRIC}

对象：label=${row.label}; taxon=${row.taxon}; rank=${row.rank}`;
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const parsed = extractJson(await callZhipu(prompt));
      const axes = normalizeAxes(parsed);
      return {
        ...axes,
        unobtainable: Boolean(parsed.unobtainable),
        protection_level: String(parsed.protection_level ?? ""),
      };
    } catch (err) {
      lastErr = err;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

function spread(vals: number[]): { min: number; max: number; range: number; mean: number } {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { min, max, range: Math.round((max - min) * 100) / 100, mean: Math.round(mean * 100) / 100 };
}

async function main() {
  const all = JSON.parse(readFileSync(taxaPath, "utf8")) as TaxonRow[];
  const list = all.filter((t) => SAMPLE_IDS.includes(t.id));
  console.log(`GLM stability: ${list.length} taxa × ${RUNS} runs (temp=0)\n`);

  const report: Array<Record<string, unknown>> = [];

  for (const row of list) {
    process.stdout.write(`#${row.id} ${row.label} ... `);
    const runs: Array<AxisScores & { unobtainable: boolean; protection_level: string }> = [];
    const errors: string[] = [];
    for (let r = 1; r <= RUNS; r++) {
      try {
        runs.push(await scoreOnce(row));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`run${r}:${msg.slice(0, 80)}`);
      }
      await sleep(500);
    }
    if (runs.length < 2) {
      console.log(`FAIL only ${runs.length}/3 ok (${errors.join("; ")})`);
      report.push({ id: row.id, label: row.label, taxon: row.taxon, error: errors, runs });
      continue;
    }
    const axisSpreads: Record<string, ReturnType<typeof spread>> = {};
    let maxRange = 0;
    for (const ax of AXES) {
      const sp = spread(runs.map((x) => x[ax]));
      axisSpreads[ax] = sp;
      maxRange = Math.max(maxRange, sp.range);
    }
    const prots = runs.map((x) => x.protection_level).join("|");
    const unob = runs.map((x) => (x.unobtainable ? "1" : "0")).join("");
    console.log(`n=${runs.length} maxΔ=${maxRange} prot=${prots} unob=${unob}`);
    report.push({
      id: row.id,
      label: row.label,
      taxon: row.taxon,
      ok_runs: runs.length,
      max_axis_range: maxRange,
      axis_spreads: axisSpreads,
      runs,
      protection_levels: runs.map((x) => x.protection_level),
      unobtainable: runs.map((x) => x.unobtainable),
      errors,
    });
  }

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `rarity-stability-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), runs: RUNS, report }, null, 2));

  console.log("\n=== max range per taxon (any axis) ===");
  for (const r of report) {
    console.log(`#${r.id} ${r.label}: maxΔ=${r.max_axis_range}`);
  }
  const big = report.filter((r) => Number(r.max_axis_range) >= 0.5);
  console.log(`\naxes with range≥0.5: ${big.length}/${report.length} taxa`);
  console.log(`json: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
