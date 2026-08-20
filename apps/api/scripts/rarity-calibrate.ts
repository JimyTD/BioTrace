/**
 * 标定：0 题仅供参考（不清楚仍答 12 题）+ 原子是/否/跳过，本地合成档位。
 * 保护级与灭绝只查表。题面与权重从 src/rarity/scale-rubric.ts 引，与生产同一份。
 * 生产不问 0 题（12 题全 null 得 0 分正好落 SR，已覆盖「不认识」）。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/rarity-calibrate.ts --model=hy3 --thinking=off --samples=1 --delay-ms=1200 --ids=1,22,27,28,29,30,34,37
 *
 * --assume-known 跳过 0 题（锚点物种模型全都答认识，省一次调用）。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../src/env.js";
import { lookupCnStatus } from "../src/rarity/cn-status.js";
import { collectibleRankFromTier } from "../src/rarity/scale-rubric.js";
import {
  KNOW_RUBRIC,
  SCALE_BATCHES,
  SCALE_ITEM_KEYS,
  UNKNOWN_PLACEHOLDER_TIER,
  emptyItems,
  majorityBool,
  mergeTri,
  parseKnows,
  parseScaleItems,
  scoreFromScale,
  type ScaleItems,
} from "../src/rarity/scale-rubric.js";

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

function parseArgs() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const idsArg = process.argv.find((a) => a.startsWith("--ids="));
  const delayArg = process.argv.find((a) => a.startsWith("--delay-ms="));
  const modelArg = process.argv.find((a) => a.startsWith("--model="));
  const thinkingArg = process.argv.find((a) => a.startsWith("--thinking="));
  const samplesArg = process.argv.find((a) => a.startsWith("--samples="));
  const providerArg = process.argv.find((a) => a.startsWith("--provider="));
  const assumeKnown = process.argv.includes("--assume-known");
  const model = modelArg?.split("=")[1]?.trim() || process.env.ZHIPU_TEXT_MODEL?.trim() || "glm-4-flash-250414";
  const providerRaw = providerArg?.split("=")[1]?.trim().toLowerCase();
  const provider =
    providerRaw === "tokenhub" || providerRaw === "zhipu"
      ? providerRaw
      : /^(hy3|hy-|hunyuan)/i.test(model)
        ? "tokenhub"
        : "zhipu";
  const ids = idsArg
    ? idsArg
        .split("=")[1]
        ?.split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    : undefined;
  return {
    limit: limitArg ? Number(limitArg.split("=")[1]) : undefined,
    ids,
    delayMs: delayArg ? Number(delayArg.split("=")[1]) : 500,
    model,
    provider: provider as "zhipu" | "tokenhub",
    thinking: /^(1|on|true|enabled)$/i.test(thinkingArg?.split("=")[1]?.trim() ?? ""),
    samples: samplesArg ? Math.max(1, Number(samplesArg.split("=")[1])) : 3,
    assumeKnown,
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

function chatFetchInit(): RequestInit {
  const init: RequestInit = {};
  if (env.httpsProxy) init.dispatcher = new ProxyAgent(env.httpsProxy);
  return init;
}

async function callChat(
  prompt: string,
  opts: { provider: "zhipu" | "tokenhub"; model: string; thinking: boolean },
): Promise<string> {
  const key = opts.provider === "tokenhub" ? env.tokenhubApiKey : env.zhipuApiKey;
  const base = opts.provider === "tokenhub" ? env.tokenhubBaseUrl : env.zhipuBaseUrl;
  if (!key) throw new Error(`${opts.provider === "tokenhub" ? "TOKENHUB_API_KEY" : "ZHIPU_API_KEY"} missing`);
  const url = `${base.replace(/\/$/, "")}/chat/completions`;
  const sendThinking =
    opts.provider === "tokenhub" || /glm-(4\.[5-9]|[5-9])/i.test(opts.model);
  const res = await undiciFetch(url, {
    ...chatFetchInit(),
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      ...(sendThinking ? { thinking: { type: opts.thinking ? "enabled" : "disabled" } } : {}),
      messages: [
        { role: "system", content: "只输出合法 JSON 对象。" },
        { role: "user", content: prompt },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${opts.provider} HTTP ${res.status}: ${body.slice(0, 300)}`);
  const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error("empty content");
  return content;
}

function taxonBlock(row: TaxonRow): string {
  return `对象：
- label: ${row.label}
- taxon: ${row.taxon}
- rank: ${row.rank}
- country: CN
- context: ordinary encounter`;
}

async function scoreOnce(
  row: TaxonRow,
  opts: {
    provider: "zhipu" | "tokenhub";
    model: string;
    thinking: boolean;
    delayMs: number;
    assumeKnown: boolean;
  },
) {
  // Anchor taxa are answered "known" by every model tried; the call is pure budget burn.
  let known = true;
  let knowReason = "assume-known";
  if (!opts.assumeKnown) {
    const knowParsed = extractJson(await callChat(`${KNOW_RUBRIC}\n\n${taxonBlock(row)}`, opts));
    known = parseKnows(knowParsed);
    knowReason = String(knowParsed.reason ?? "");
  }

  const items: Partial<ScaleItems> = {};
  const batchReasons: Record<string, string> = {};
  for (const batch of SCALE_BATCHES) {
    await sleep(opts.delayMs);
    const parsed = extractJson(await callChat(`${batch.rubric}\n\n${taxonBlock(row)}`, opts));
    Object.assign(items, parseScaleItems(parsed, batch.keys));
    batchReasons[batch.id] = String(parsed.reason ?? "");
  }
  return {
    known,
    items: items as ScaleItems,
    knowReason,
    batchReasons,
  };
}

function mergeItems(draws: ScaleItems[]): ScaleItems {
  const merged = emptyItems();
  for (const key of SCALE_ITEM_KEYS) {
    merged[key] = mergeTri(draws.map((d) => d[key]));
  }
  return merged;
}

function compactItems(items: ScaleItems | null): string {
  if (!items) return SCALE_ITEM_KEYS.map(() => "-").join("");
  return SCALE_ITEM_KEYS.map((k) => (items[k] === true ? "T" : items[k] === false ? "F" : "?")).join("");
}

function triCsv(v: unknown): string {
  if (v === true) return "1";
  if (v === false) return "0";
  return "";
}

function listOpts(listed: ReturnType<typeof lookupCnStatus>) {
  return {
    sanyou: listed.sanyou,
    extinct: listed.extinct,
    class_i: listed.class_i,
    class_ii: listed.class_ii,
  };
}

async function scoreRow(
  row: TaxonRow,
  opts: {
    provider: "zhipu" | "tokenhub";
    model: string;
    thinking: boolean;
    samples: number;
    delayMs: number;
    assumeKnown: boolean;
  },
) {
  const listed = lookupCnStatus(row.taxon, row.label);
  if (listed.extinct) {
    const scored = scoreFromScale(emptyItems(), listOpts(listed));
    return {
      known: true,
      knowSamples: [] as boolean[],
      items: null as ScaleItems | null,
      itemSamples: [] as Array<ScaleItems | null>,
      score: scored.score,
      rarity: scored.rarity,
      adjustments: scored.adjustments,
      knowReason: "list:extinct",
      batchReasons: {},
      listLevel: listed.level,
    };
  }

  const draws: Awaited<ReturnType<typeof scoreOnce>>[] = [];
  for (let i = 0; i < opts.samples; i++) {
    if (i > 0) await sleep(opts.delayMs);
    draws.push(await withRetry(() => scoreOnce(row, opts), `#${row.id}.${i + 1}`));
  }
  const knowSamples = draws.map((d) => d.known);
  const known = majorityBool(knowSamples);
  const knowReason = draws.find((d) => d.known === known)?.knowReason ?? draws[0]!.knowReason;
  const itemDraws = draws.filter((d): d is typeof d & { items: ScaleItems } => d.items != null);
  const items = itemDraws.length ? mergeItems(itemDraws.map((d) => d.items)) : emptyItems();
  const scored = scoreFromScale(items, listOpts(listed));
  return {
    known,
    knowSamples,
    items,
    itemSamples: draws.map((d) => d.items),
    score: scored.score,
    rarity: scored.rarity,
    adjustments: scored.adjustments,
    knowReason,
    batchReasons: itemDraws[0]?.batchReasons ?? {},
    listLevel: listed.level,
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
  const list = args.ids?.length
    ? taxa.filter((row) => args.ids!.includes(row.id))
    : args.limit
      ? taxa.slice(0, args.limit)
      : taxa;
  console.log(
    `Provider: ${args.provider} | model=${args.model} | thinking=${args.thinking ? "on" : "off"} | samples=${args.samples} | mode=${args.assumeKnown ? "assume-known" : "know"}+${SCALE_ITEM_KEYS.length}tri | items=${list.length}`,
  );
  console.log(`keys: ${SCALE_ITEM_KEYS.join(" ")}`);

  const rows: Array<Record<string, unknown>> = [];
  const userPairs: Array<{ model: string; ref: string }> = [];
  const agentPairs: Array<{ model: string; ref: string }> = [];

  for (const row of list) {
    process.stdout.write(`#${row.id} ${row.label} ... `);
    try {
      const scored = await scoreRow(row, {
        provider: args.provider,
        model: args.model,
        thinking: args.thinking,
        samples: args.samples,
        delayMs: args.delayMs,
        assumeKnown: args.assumeKnown,
      });
      await sleep(args.delayMs);
      const userTier = String(row.user ?? "").trim();
      const agentTier = String(row.agent ?? "").trim();
      const distUser = userTier ? tierDelta(scored.rarity, userTier) : null;
      const distAgent = agentTier ? tierDelta(scored.rarity, agentTier) : null;
      if (scored.known && userTier) userPairs.push({ model: scored.rarity, ref: userTier });
      if (scored.known && agentTier) agentPairs.push({ model: scored.rarity, ref: agentTier });
      rows.push({
        id: row.id,
        label: row.label,
        taxon: row.taxon,
        user: userTier || "",
        agent: agentTier || "",
        known: scored.known,
        know_samples: scored.knowSamples,
        model: scored.rarity,
        score: scored.score,
        adjustments: scored.adjustments,
        items: scored.items,
        item_compact: compactItems(scored.items),
        item_samples: scored.itemSamples,
        dist_user: distUser,
        dist_agent: distAgent,
        know_reason: scored.knowReason,
        batch_reasons: scored.batchReasons,
        list_level: scored.listLevel ?? "",
        notes: row.notes ?? "",
        ...Object.fromEntries(SCALE_ITEM_KEYS.map((k) => [k, scored.items?.[k] ?? ""])),
      });
      const sign = (d: number) => (d > 0 ? `+${d}` : String(d));
      const ref =
        distUser != null
          ? `user ${userTier} ${sign(distUser)}`
          : distAgent != null
            ? `agent ${agentTier} ${sign(distAgent)}`
            : "no ref";
      const knowTag = scored.known ? "known" : "UNKNOWN";
      const sTag = scored.score == null ? "-" : String(scored.score);
      const listTag = scored.listLevel ? ` list=${scored.listLevel}` : "";
      console.log(
        `${knowTag} ${scored.rarity} S=${sTag} (${ref}) ${compactItems(scored.items)}` +
          (scored.adjustments.length ? ` [${scored.adjustments.join(",")}]` : "") +
          listTag,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL ${msg}`);
      rows.push({ id: row.id, label: row.label, user: row.user, agent: row.agent, model: null, error: msg });
    }
  }

  const userMetrics = metrics(userPairs);
  const agentMetrics = metrics(agentPairs);
  const unknownRows = rows.filter((r) => r.known === false && !r.error);
  const knownRows = rows.filter((r) => r.known === true);
  const trueRates = Object.fromEntries(
    SCALE_ITEM_KEYS.map((k) => {
      const vals = knownRows.map((r) => r[k]).filter((v) => typeof v === "boolean");
      const yes = vals.filter(Boolean).length;
      return [k, vals.length ? Number((yes / vals.length).toFixed(2)) : null];
    }),
  );
  const skipRates = Object.fromEntries(
    SCALE_ITEM_KEYS.map((k) => {
      const vals = knownRows.map((r) => r[k]);
      const n = vals.length;
      const skip = vals.filter((v) => v == null || v === "").length;
      return [k, n ? Number((skip / n).toFixed(2)) : null];
    }),
  );

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = `${args.model.replace(/[^a-z0-9.]+/gi, "-")}-think-${args.thinking ? "on" : "off"}-s${args.samples}`;
  const outJson = join(outDir, `rarity-calibrate-${slug}-${stamp}.json`);
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        scheme: "know_scale14_tri",
        provider: args.provider,
        model: args.model,
        thinking: args.thinking,
        samples: args.samples,
        assumeKnown: args.assumeKnown,
        itemKeys: SCALE_ITEM_KEYS,
        summary: {
          n: rows.length,
          known: knownRows.length,
          unknown: unknownRows.length,
          unknownLabels: unknownRows.map((r) => r.label),
          vsUser: userMetrics,
          vsAgent: agentMetrics,
          trueRates,
          skipRates,
        },
        rows,
      },
      null,
      2,
    ),
    "utf8",
  );

  const csv = [
    ["id", "label", "user", "agent", "known", "model", "score", "item_compact", ...SCALE_ITEM_KEYS, "dist_user", "dist_agent", "know_reason"].join(","),
    ...rows.map((r) =>
      [
        r.id,
        JSON.stringify(r.label ?? ""),
        r.user ?? "",
        r.agent ?? "",
        r.known ?? "",
        r.model ?? "",
        r.score ?? "",
        r.item_compact ?? "",
        ...SCALE_ITEM_KEYS.map((k) => triCsv(r[k])),
        r.dist_user ?? "",
        r.dist_agent ?? "",
        JSON.stringify(r.know_reason ?? r.error ?? ""),
      ].join(","),
    ),
  ].join("\n");
  const outCsv = join(outDir, `rarity-calibrate-${slug}-${stamp}.csv`);
  writeFileSync(outCsv, csv, "utf8");

  console.log("\n=== summary ===");
  console.log(`认识 ${knownRows.length}/${rows.length} | 不清楚 ${unknownRows.length}` +
    (unknownRows.length ? `（${unknownRows.map((r) => r.label).join("、")}）` : ""));
  console.log(fmtMetrics("vs user（仅认识） ", userMetrics));
  console.log(fmtMetrics("vs agent（仅认识）", agentMetrics));
  console.log(`trueRates: ${SCALE_ITEM_KEYS.map((k) => `${k}=${trueRates[k] ?? "-"}`).join(" ")}`);
  console.log(`skipRates: ${SCALE_ITEM_KEYS.map((k) => `${k}=${skipRates[k] ?? "-"}`).join(" ")}`);
  console.log(`json: ${outJson}`);
  console.log(`csv:  ${outCsv}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
