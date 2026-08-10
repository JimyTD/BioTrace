/**
 * Encounter-class rarity calibration (no images, no weighted sum).
 *
 *   pnpm exec tsx scripts/rarity-calibrate.ts --provider=zhipu
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../src/env.js";
import { ENCOUNTER_RUBRIC } from "../src/rarity/encounter-rubric.js";
import {
  collectibleRankFromTier,
  parseEncounterClass,
  parseProtectionLevel,
  resolveFromEncounter,
  type EncounterClass,
} from "../src/rarity/formula.js";

type TaxonRow = {
  id: number;
  label: string;
  taxon: string;
  rank: string;
  user: string;
  agent: string;
  notes?: string;
};

const root = dirname(fileURLToPath(import.meta.url));
const taxaPath = join(root, "rarity-calibrate-taxa.json");
const outDir = join(root, "out");

const RUBRIC = ENCOUNTER_RUBRIC;

function parseArgs() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const delayArg = process.argv.find((a) => a.startsWith("--delay-ms="));
  return {
    limit: limitArg ? Number(limitArg.split("=")[1]) : undefined,
    delayMs: delayArg ? Number(delayArg.split("=")[1]) : 500,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/429|quota|rate|Too Many|timeout|ECONNRESET|503|fetch failed/i.test(msg) || i === attempts) {
        throw err;
      }
      const wait = Math.min(60_000, 4_000 * i);
      console.log(`retry ${label} (${i}/${attempts}) in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw last;
}

function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let raw = (fenced?.[1] ?? text).trim();
  raw = raw.replace(/\bFalse\b/g, "false").replace(/\bTrue\b/g, "true").replace(/\bNone\b/g, "null");
  const start = raw.indexOf("{");
  if (start < 0) throw new Error(`no json: ${text.slice(0, 160)}`);
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth += 1;
    else if (raw[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`unbalanced json: ${text.slice(0, 160)}`);
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
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

async function scoreOne(row: TaxonRow) {
  const prompt = `${RUBRIC}

对象：
- label: ${row.label}
- taxon: ${row.taxon}
- rank: ${row.rank}
- country: CN
- context: wild field encounter`;

  const parsed = extractJson(await callZhipu(prompt));
  const cls = parseEncounterClass(parsed.encounter_class);
  if (!cls) throw new Error(`bad encounter_class: ${String(parsed.encounter_class)}`);
  const resolved = resolveFromEncounter({
    encounterClass: cls,
    swarmOrHabituated: Number(parsed.swarm_or_habituated ?? 0),
    protectionLevel: parseProtectionLevel(parsed.protection_level),
    hardToPhotograph: Boolean(parsed.hard_to_photograph),
  });
  return {
    encounterClass: cls as EncounterClass,
    swarmOrHabituated: Number(parsed.swarm_or_habituated ?? 0),
    protectionLevel: parseProtectionLevel(parsed.protection_level),
    hardToPhotograph: Boolean(parsed.hard_to_photograph),
    reason: String(parsed.reason ?? ""),
    ...resolved,
  };
}

function tierDistance(a: string, b: string): number {
  return Math.abs(collectibleRankFromTier(a) - collectibleRankFromTier(b));
}

async function main() {
  const args = parseArgs();
  const taxa = JSON.parse(readFileSync(taxaPath, "utf8")) as TaxonRow[];
  const list = args.limit ? taxa.slice(0, args.limit) : taxa;
  console.log(`Provider: zhipu | mode=encounter_class | items=${list.length}`);

  const rows: Array<Record<string, unknown>> = [];
  let exact = 0;
  let within1 = 0;

  for (const row of list) {
    process.stdout.write(`#${row.id} ${row.label} ... `);
    try {
      const scored = await withRetry(() => scoreOne(row), `#${row.id}`);
      await sleep(args.delayMs);
      const dist = tierDistance(scored.rarity, row.user);
      if (dist === 0) exact += 1;
      if (dist <= 1) within1 += 1;
      rows.push({
        id: row.id,
        label: row.label,
        taxon: row.taxon,
        user: row.user,
        agent: row.agent,
        model: scored.rarity,
        base_tier: scored.baseTier,
        encounter_class: scored.encounterClass,
        adjustments: scored.adjustments,
        swarm_or_habituated: scored.swarmOrHabituated,
        protection_level: scored.protectionLevel,
        hard_to_photograph: scored.hardToPhotograph,
        dist_user: dist,
        reason: scored.reason,
        notes: row.notes ?? "",
      });
      console.log(
        `${scored.rarity} (user ${row.user}, Δ${dist}) class=${scored.encounterClass}` +
          (scored.adjustments.length ? ` [${scored.adjustments.join(",")}]` : ""),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL ${msg}`);
      rows.push({ id: row.id, label: row.label, user: row.user, agent: row.agent, model: null, error: msg });
    }
  }

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outJson = join(outDir, `rarity-calibrate-${stamp}.json`);
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        scheme: "encounter_class_veto",
        provider: "zhipu",
        summary: { n: rows.length, exact_vs_user: exact, within1_vs_user: within1 },
        rows,
      },
      null,
      2,
    ),
    "utf8",
  );

  const csv = [
    "id,label,user,model,encounter_class,dist_user,adjustments,protection_level,reason",
    ...rows.map((r) =>
      [
        r.id,
        JSON.stringify(r.label ?? ""),
        r.user ?? "",
        r.model ?? "",
        r.encounter_class ?? "",
        r.dist_user ?? "",
        JSON.stringify((r.adjustments as string[] | undefined)?.join("|") ?? ""),
        r.protection_level ?? "",
        JSON.stringify(r.reason ?? r.error ?? ""),
      ].join(","),
    ),
  ].join("\n");
  const outCsv = join(outDir, `rarity-calibrate-${stamp}.csv`);
  writeFileSync(outCsv, csv, "utf8");

  console.log("\n=== summary vs user ===");
  console.log(`exact: ${exact}/${rows.length}`);
  console.log(`within 1 tier: ${within1}/${rows.length}`);
  console.log(`json: ${outJson}`);
  console.log(`csv:  ${outCsv}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
