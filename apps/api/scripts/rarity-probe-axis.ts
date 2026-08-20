/**
 * 单题探针：只问一道题，对着已知答案核题面。改题面后用它做单元测，不必全量重跑。
 * 题面从 rarity-scale-rubric.ts 的 SCALE_QUESTIONS 取，保证测的就是线上那句话。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/rarity-probe-axis.ts --key=large --samples=2 \
 *     --provider=tokenhub --model=glm-5.1 --thinking=off --delay-ms=1200
 */
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../src/env.js";
import {
  SCALE_QUESTIONS,
  batchRubric,
  mergeTri,
  parseScaleItems,
  type ScaleItemKey,
  type ScaleTri,
} from "../src/rarity/scale-rubric.js";

/** expect 为 null = 边界情形，两种答案都不算错。 */
type Case = { label: string; taxon: string; rank: string; expect: ScaleTri; note?: string };

const CASES: Partial<Record<ScaleItemKey, Case[]>> = {
  large: [
    { label: "大熊猫（野生）", taxon: "Ailuropoda melanoleuca", rank: "species", expect: true, note: "100–115kg" },
    { label: "东北虎（野生）", taxon: "Panthera tigris", rank: "species", expect: true, note: "200kg+" },
    { label: "羚牛", taxon: "Budorcas taxicolor", rank: "species", expect: true, note: "约 300kg" },
    { label: "白唇鹿", taxon: "Cervus albirostris", rank: "species", expect: true, note: "130–200kg" },
    { label: "野猪", taxon: "Sus scrofa", rank: "species", expect: true, note: "50–100kg" },
    { label: "家马", taxon: "Equus caballus", rank: "species", expect: true, note: "400kg+" },
    { label: "雪豹", taxon: "Panthera uncia", rank: "species", expect: null, note: "25–55kg，压线" },
    { label: "扬子鳄", taxon: "Alligator sinensis", rank: "species", expect: null, note: "36–45kg，压线" },
    { label: "川金丝猴", taxon: "Rhinopithecus roxellana", rank: "species", expect: false, note: "15–20kg" },
    { label: "猕猴（野外）", taxon: "Macaca mulatta", rank: "species", expect: false, note: "5–10kg" },
    { label: "貉", taxon: "Nyctereutes procyonoides", rank: "species", expect: false, note: "4–6kg" },
    { label: "中华穿山甲", taxon: "Manis pentadactyla", rank: "species", expect: false, note: "2–7kg" },
    { label: "家犬", taxon: "Canis lupus familiaris", rank: "species", expect: false, note: "种级均值远低于 50kg" },
    { label: "家猫", taxon: "Felis catus", rank: "species", expect: false, note: "约 4kg" },
    { label: "乌鸫", taxon: "Turdus mandarinus", rank: "species", expect: false, note: "约 100g" },
  ],
};

function parseArgs() {
  const get = (name: string) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]?.trim();
  const model = get("model") || process.env.ZHIPU_TEXT_MODEL?.trim() || "glm-4-flash-250414";
  const providerRaw = get("provider")?.toLowerCase();
  const provider =
    providerRaw === "tokenhub" || providerRaw === "zhipu"
      ? providerRaw
      : /^(hy3|hy-|hunyuan)/i.test(model)
        ? "tokenhub"
        : "zhipu";
  return {
    key: (get("key") ?? "large") as ScaleItemKey,
    model,
    provider: provider as "zhipu" | "tokenhub",
    thinking: /^(1|on|true|enabled)$/i.test(get("thinking") ?? ""),
    samples: Math.max(1, Number(get("samples") ?? 2)),
    delayMs: Number(get("delay-ms") ?? 1200),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

async function callChat(
  prompt: string,
  opts: { provider: "zhipu" | "tokenhub"; model: string; thinking: boolean },
): Promise<string> {
  const key = opts.provider === "tokenhub" ? env.tokenhubApiKey : env.zhipuApiKey;
  const base = opts.provider === "tokenhub" ? env.tokenhubBaseUrl : env.zhipuBaseUrl;
  if (!key) throw new Error(`${opts.provider} api key missing`);
  const init: RequestInit = {};
  if (env.httpsProxy) init.dispatcher = new ProxyAgent(env.httpsProxy);
  const sendThinking = opts.provider === "tokenhub" || /glm-(4\.[5-9]|[5-9])/i.test(opts.model);
  const res = await undiciFetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    ...init,
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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

function show(v: ScaleTri): string {
  return v === true ? "是" : v === false ? "否" : "?";
}

async function main() {
  const args = parseArgs();
  const cases = CASES[args.key];
  if (!cases) throw new Error(`没有 ${args.key} 的期望表`);
  const rubric = batchRubric([args.key]);
  console.log(`题：${args.key}\n${SCALE_QUESTIONS[args.key]}\n`);
  console.log(
    `provider=${args.provider} model=${args.model} thinking=${args.thinking ? "on" : "off"} samples=${args.samples} 用例=${cases.length}\n`,
  );

  let pass = 0;
  let edge = 0;
  const wrong: string[] = [];
  for (const c of cases) {
    const draws: ScaleTri[] = [];
    for (let i = 0; i < args.samples; i++) {
      if (i > 0) await sleep(args.delayMs);
      const block = `对象：\n- label: ${c.label}\n- taxon: ${c.taxon}\n- rank: ${c.rank}\n- country: CN\n- context: ordinary encounter`;
      const parsed = extractJson(await callChat(`${rubric}\n\n${block}`, args));
      draws.push(parseScaleItems(parsed, [args.key])[args.key] ?? null);
    }
    const got = mergeTri(draws);
    const stable = draws.every((d) => d === draws[0]);
    let verdict: string;
    if (c.expect === null) {
      verdict = "边界";
      edge += 1;
    } else if (got === c.expect) {
      verdict = "过";
      pass += 1;
    } else {
      verdict = "错";
      wrong.push(c.label);
    }
    console.log(
      `${c.label.padEnd(8)} 期望 ${show(c.expect).padEnd(2)} 实测 ${show(got)}${stable ? " " : "*"} ${verdict}` +
        (c.note ? `  （${c.note}）` : ""),
    );
    await sleep(args.delayMs);
  }

  const scored = cases.length - edge;
  console.log(`\n判定用例 ${scored} 条：过 ${pass}，错 ${wrong.length}${wrong.length ? `（${wrong.join("、")}）` : ""}`);
  console.log(`边界用例 ${edge} 条不计。* 表示多次采样答案不一致。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
