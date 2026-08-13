/**
 * Encounter-class rarity calibration (no images, no weighted sum).
 *
 *   pnpm exec tsx scripts/rarity-calibrate.ts --model=glm-4.7-flash --thinking=off --delay-ms=3000
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../src/env.js";
import { ENCOUNTER_RUBRIC } from "../src/rarity/encounter-rubric.js";
import {
  collectibleRankFromTier,
  parseBoolFlag,
  parseExtinctFlag,
  parseFrequency,
  parseHardToPhotograph,
  parseIconicAppeal,
  parseProtectionLevel,
  parseSwarm,
  resolveFromEncounter,
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
  const modelArg = process.argv.find((a) => a.startsWith("--model="));
  const thinkingArg = process.argv.find((a) => a.startsWith("--thinking="));
  const samplesArg = process.argv.find((a) => a.startsWith("--samples="));
  return {
    limit: limitArg ? Number(limitArg.split("=")[1]) : undefined,
    delayMs: delayArg ? Number(delayArg.split("=")[1]) : 500,
    model: modelArg?.split("=")[1]?.trim() || process.env.ZHIPU_TEXT_MODEL?.trim() || "glm-4-flash-250414",
    thinking: /^(1|on|true|enabled)$/i.test(thinkingArg?.split("=")[1]?.trim() ?? ""),
    samples: samplesArg ? Math.max(1, Number(samplesArg.split("=")[1])) : 3,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 6): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/429|5\d\d|quota|rate|Too Many|timeout|ECONNRESET|fetch failed/i.test(msg) || i === attempts) {
        throw err;
      }
      // Zhipu free tier allows ~1 req/s on a single connection; back off hard on 1302.
      const wait = Math.min(90_000, 6_000 * 2 ** (i - 1));
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

async function callZhipu(prompt: string, opts: { model: string; thinking: boolean }): Promise<string> {
  if (!env.zhipuApiKey) throw new Error("ZHIPU_API_KEY missing");
  const url = `${env.zhipuBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await undiciFetch(url, {
    ...zhipuFetchInit(),
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.zhipuApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      // Only hybrid-thinking models (glm-4.5+) accept this field.
      ...(/glm-(4\.[5-9]|[5-9])/i.test(opts.model)
        ? { thinking: { type: opts.thinking ? "enabled" : "disabled" } }
        : {}),
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

async function scoreOnce(row: TaxonRow, opts: { model: string; thinking: boolean }) {
  const prompt = `${RUBRIC}

对象：
- label: ${row.label}
- taxon: ${row.taxon}
- rank: ${row.rank}
- country: CN
- context: wild field encounter`;

  const parsed = extractJson(await callZhipu(prompt, opts));
  const frequency = parseFrequency(parsed.encounter_frequency);
  if (frequency == null) {
    throw new Error(`bad encounter_frequency: ${String(parsed.encounter_frequency)}`);
  }
  return {
    frequency,
    extinct: parseExtinctFlag(parsed.extinct_or_unobtainable, parsed.extinct_year),
    extinctYear: parsed.extinct_year ?? null,
    pestOrWeed: parseBoolFlag(parsed.pest_or_weed),
    iconicAppeal: parseIconicAppeal(parsed.iconic_appeal),
    swarmOrHabituated: parseSwarm(parsed.swarm_or_habituated),
    protectionLevel: parseProtectionLevel(parsed.protection_level),
    hardToPhotograph: parseHardToPhotograph(parsed.hard_to_photograph),
    reason: String(parsed.reason ?? ""),
  };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

function majority(values: boolean[]): boolean {
  return values.filter(Boolean).length * 2 > values.length;
}


/** Sample the model N times and take the median — the axes are noisy per call. */
async function scoreRow(
  row: TaxonRow,
  opts: { model: string; thinking: boolean; samples: number; delayMs: number },
) {
  const draws: Awaited<ReturnType<typeof scoreOnce>>[] = [];
  for (let i = 0; i < opts.samples; i++) {
    if (i > 0) await sleep(opts.delayMs);
    draws.push(await withRetry(() => scoreOnce(row, opts), `#${row.id}.${i + 1}`));
  }
  const freqs = draws.map((d) => d.frequency);
  const merged = {
    frequency: median(freqs),
    extinct: majority(draws.map((d) => d.extinct)),
    pestOrWeed: majority(draws.map((d) => d.pestOrWeed)),
    iconicAppeal: median(draws.map((d) => d.iconicAppeal)),
    swarmOrHabituated: median(draws.map((d) => d.swarmOrHabituated)),
    hardToPhotograph: median(draws.map((d) => d.hardToPhotograph)),
    protectionLevel: draws[0]!.protectionLevel,
  };
  // Quote the draw that actually produced the median, not whichever came back first.
  const representative = draws.find((d) => d.frequency === merged.frequency) ?? draws[0]!;
  return {
    ...merged,
    reason: representative.reason,
    extinctYear: representative.extinctYear,
    freqSamples: freqs,
    /** Spread across draws: >=2 means the model has no firm view on this taxon. */
    freqSpread: Math.max(...freqs) - Math.min(...freqs),
    ...resolveFromEncounter(merged),
  };
}

/** Signed: >0 means the model ranked it rarer than the reference. */
function tierDelta(model: string, ref: string): number {
  return collectibleRankFromTier(model) - collectibleRankFromTier(ref);
}

function rankOf(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.v === order[i]!.v) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]!.i] = avg;
    i = j + 1;
  }
  return ranks;
}

function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length < 3) return null;
  const rx = rankOf(xs);
  const ry = rankOf(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    const a = rx[i]! - mx;
    const b = ry[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

/** The four numbers we steer by: ordering, systematic shift, exact hits, near hits. */
function metrics(pairs: Array<{ model: string; ref: string }>) {
  const n = pairs.length;
  if (!n) return null;
  const m = pairs.map((p) => collectibleRankFromTier(p.model));
  const r = pairs.map((p) => collectibleRankFromTier(p.ref));
  const deltas = pairs.map((p) => tierDelta(p.model, p.ref));
  return {
    n,
    spearman: spearman(m, r),
    bias: deltas.reduce((a, b) => a + b, 0) / n,
    exact: deltas.filter((d) => d === 0).length,
    within1: deltas.filter((d) => Math.abs(d) <= 1).length,
    worst: Math.max(...deltas.map(Math.abs)),
  };
}

function fmtMetrics(label: string, m: ReturnType<typeof metrics>) {
  if (!m) return `${label}: (无参考列)`;
  const rho = m.spearman == null ? "n/a" : m.spearman.toFixed(3);
  const bias = (m.bias >= 0 ? "+" : "") + m.bias.toFixed(2);
  return `${label}: 排序 ρ=${rho} | 偏移 ${bias} 档 | 命中 ${m.exact}/${m.n} | ≤1档 ${m.within1}/${m.n} | 最差 ${m.worst} 档`;
}

async function main() {
  const args = parseArgs();
  const taxa = JSON.parse(readFileSync(taxaPath, "utf8")) as TaxonRow[];
  const list = args.limit ? taxa.slice(0, args.limit) : taxa;
  console.log(
    `Provider: zhipu | model=${args.model} | thinking=${args.thinking ? "on" : "off"} | samples=${args.samples} | mode=frequency+offset | items=${list.length}`,
  );

  const rows: Array<Record<string, unknown>> = [];
  const userPairs: Array<{ model: string; ref: string }> = [];
  const agentPairs: Array<{ model: string; ref: string }> = [];
  const spreads: number[] = [];

  for (const row of list) {
    process.stdout.write(`#${row.id} ${row.label} ... `);
    try {
      const scored = await scoreRow(row, {
        model: args.model,
        thinking: args.thinking,
        samples: args.samples,
        delayMs: args.delayMs,
      });
      await sleep(args.delayMs);
      const userTier = String(row.user ?? "").trim();
      const agentTier = String(row.agent ?? "").trim();
      const distUser = userTier ? tierDelta(scored.rarity, userTier) : null;
      const distAgent = agentTier ? tierDelta(scored.rarity, agentTier) : null;
      if (userTier) userPairs.push({ model: scored.rarity, ref: userTier });
      if (agentTier) agentPairs.push({ model: scored.rarity, ref: agentTier });
      spreads.push(scored.freqSpread);
      rows.push({
        id: row.id,
        label: row.label,
        taxon: row.taxon,
        user: userTier || "",
        agent: agentTier || "",
        model: scored.rarity,
        base_tier: scored.baseTier,
        encounter_frequency: scored.frequency,
        freq_samples: scored.freqSamples,
        freq_spread: scored.freqSpread,
        extinct_or_unobtainable: scored.extinct,
        extinct_year: scored.extinctYear,
        pest_or_weed: scored.pestOrWeed,
        adjustments: scored.adjustments,
        iconic_appeal: scored.iconicAppeal,
        swarm_or_habituated: scored.swarmOrHabituated,
        protection_level: scored.protectionLevel,
        hard_to_photograph: scored.hardToPhotograph,
        offset_score: scored.offsetScore,
        offset_delta: scored.offsetDelta,
        dist_user: distUser,
        dist_agent: distAgent,
        reason: scored.reason,
        notes: row.notes ?? "",
      });
      const sign = (d: number) => (d > 0 ? `+${d}` : String(d));
      const ref =
        distUser != null
          ? `user ${userTier} ${sign(distUser)}`
          : distAgent != null
            ? `agent ${agentTier} ${sign(distAgent)}`
            : "no ref";
      console.log(
        `${scored.rarity} (${ref}) freq=${scored.frequency}[${scored.freqSamples.join("/")}] S=${scored.offsetScore.toFixed(2)} d=${scored.offsetDelta}` +
          (scored.adjustments.length ? ` [${scored.adjustments.join(",")}]` : ""),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL ${msg}`);
      rows.push({ id: row.id, label: row.label, user: row.user, agent: row.agent, model: null, error: msg });
    }
  }

  const userMetrics = metrics(userPairs);
  const agentMetrics = metrics(agentPairs);
  const avgSpread = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0;
  const shaky = rows.filter((r) => typeof r.freq_spread === "number" && (r.freq_spread as number) >= 2);

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = `${args.model.replace(/[^a-z0-9.]+/gi, "-")}-think-${args.thinking ? "on" : "off"}-s${args.samples}`;
  const outJson = join(outDir, `rarity-calibrate-${slug}-${stamp}.json`);
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        scheme: "encounter_frequency_offset",
        provider: "zhipu",
        model: args.model,
        thinking: args.thinking,
        samples: args.samples,
        summary: {
          n: rows.length,
          vsUser: userMetrics,
          vsAgent: agentMetrics,
          avgFreqSpread: Number(avgSpread.toFixed(2)),
          shakyIds: shaky.map((r) => r.id),
        },
        rows,
      },
      null,
      2,
    ),
    "utf8",
  );

  const csv = [
    "id,label,user,agent,model,freq,spread,extinct,pest,iconic,swarm,hard,offset_score,offset_delta,dist_user,dist_agent,protection_level,reason",
    ...rows.map((r) =>
      [
        r.id,
        JSON.stringify(r.label ?? ""),
        r.user ?? "",
        r.agent ?? "",
        r.model ?? "",
        r.encounter_frequency ?? "",
        r.freq_spread ?? "",
        r.extinct_or_unobtainable ? 1 : 0,
        r.pest_or_weed ? 1 : 0,
        r.iconic_appeal ?? "",
        r.swarm_or_habituated ?? "",
        r.hard_to_photograph ?? "",
        r.offset_score ?? "",
        r.offset_delta ?? "",
        r.dist_user ?? "",
        r.dist_agent ?? "",
        r.protection_level ?? "",
        JSON.stringify(r.reason ?? r.error ?? ""),
      ].join(","),
    ),
  ].join("\n");
  const outCsv = join(outDir, `rarity-calibrate-${slug}-${stamp}.csv`);
  writeFileSync(outCsv, csv, "utf8");

  console.log("\n=== summary ===");
  console.log(fmtMetrics("vs user ", userMetrics));
  console.log(fmtMetrics("vs agent", agentMetrics));
  console.log(`采样分歧：平均 ${avgSpread.toFixed(2)} 级，需复核 ${shaky.length} 项` +
    (shaky.length ? `（${shaky.map((r) => r.label).join("、")}）` : ""));
  console.log(`json: ${outJson}`);
  console.log(`csv:  ${outCsv}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
