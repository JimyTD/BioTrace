/**
 * 离线重放：拿已跑出的答案算不同配置的档位，不调模型、不改 rarity-scale-rubric.ts。
 * calibrate 输出已含全部题；--probe= 只在答案分散在两份文件时才需要。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/rarity-replay-plan.ts
 *   node node_modules/tsx/dist/cli.mjs scripts/rarity-replay-plan.ts --cal=<file.json> --probe=<file.json>
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectibleRankFromTier } from "../src/rarity/scale-rubric.js";
import {
  SCALE_ITEM_KEYS,
  SCALE_WEIGHTS,
  emptyItems,
  rarityFromScore,
  scoreFromScale,
  type ScaleItemKey,
} from "../src/rarity/scale-rubric.js";

type Tri = boolean | null;

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "out");

function latest(prefix: string): string {
  const hit = readdirSync(outDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort();
  const last = hit.at(-1);
  if (!last) throw new Error(`no ${prefix}*.json in ${outDir}`);
  return join(outDir, last);
}

function argFile(flag: string, prefix: string | null): string | null {
  const raw = process.argv.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1]?.trim();
  if (raw === "none") return null;
  if (!raw) {
    if (!prefix) return null;
    try {
      return latest(prefix);
    } catch {
      return null;
    }
  }
  return raw.includes("\\") || raw.includes("/") ? raw : join(outDir, raw);
}

type Weights = Record<keyof typeof SCALE_WEIGHTS, number>;

const BASE: Weights = { ...SCALE_WEIGHTS };

type Config = {
  name: string;
  /** 室内为真时不再给夜行/常空手加分——同一件「跟着人住」的事不重复抬。 */
  indoorDedupe?: boolean;
  /** 遍地折扣生效时不再给夜行/常空手加分——到处都是就谈不上夜里碰不到、也谈不上难找。 */
  denseDedupe?: boolean;
  /** 众多已扣时，成群仍记的比例（缺省 0 = 完全不记，现行行为）。 */
  swarmWhenDense?: number;
  weights: Weights;
};

/** 现行 = 遍地去重 + 现行权重。「难拍到」象限的三题（夜行/短窗口/常空手）拉平试算。 */
const flat = (v: number): Weights => ({
  ...BASE,
  nocturnal: v,
  short_window: v,
  often_absent: v,
});

const CONFIGS: Config[] = [
  { name: "现行喜0.8", denseDedupe: true, weights: BASE },
  { name: "喜0.6", denseDedupe: true, weights: { ...BASE, liked: 0.6 } },
  { name: "喜0.5", denseDedupe: true, weights: { ...BASE, liked: 0.5 } },
  { name: "喜0.4", denseDedupe: true, weights: { ...BASE, liked: 0.4 } },
  { name: "喜0.3", denseDedupe: true, weights: { ...BASE, liked: 0.3 } },
];

type Row = {
  id: number;
  label: string;
  ref: string;
  /** ref 来自你的标注（而不是 agent 兜底）。 */
  byUser: boolean;
  extinct: boolean;
  list: "" | "sanyou" | "class_ii" | "class_i";
  items: Record<string, Tri>;
};

function tri(v: unknown): Tri {
  return v === true ? true : v === false ? false : null;
}

function yes(v: Tri): boolean {
  return v === true;
}

function score(row: Row, cfg: Config): { score: number; tier: string; adj: string[] } {
  if (row.extinct) return { score: 99, tier: "XR", adj: ["gate:extinct"] };
  const w = cfg.weights;
  const it = row.items;
  const adj: string[] = [];
  let s = 0;
  const add = (v: number, tag: string) => {
    adj.push(`${tag}${v >= 0 ? "+" : ""}${Number(v.toFixed(2))}`);
    s += v;
  };

  // 离人阶梯：室内 > 市区 > 郊野（第三级不扣）。同一件事只算最重的一级。
  if (yes(it.indoor)) add(w.indoor, "indoor");
  else if (yes(it.near_home)) add(w.near_home, "near");

  if (yes(it.domesticated)) add(w.domesticated, "domestic");
  if (yes(it.disliked)) add(w.disliked, "disliked");

  const classI = row.list === "class_i";
  const classII = row.list === "class_ii";
  const sanyou = row.list === "sanyou";
  const abundant =
    yes(it.habitat_common) && !classI && !classII && !sanyou && !yes(it.short_window);
  if (abundant) {
    add(w.habitat_common, "dense");
    if (cfg.swarmWhenDense && yes(it.swarm)) add(w.swarm * cfg.swarmWhenDense, "swarm");
  } else if (yes(it.swarm)) {
    add(w.swarm, "swarm");
  }

  if (classI) add(w.class_i, "class_i");
  else if (classII) add(w.class_ii, "class_ii");
  else if (sanyou) add(w.sanyou, "sanyou");

  // 抬分轴不叠在「跟着人住」和「遍地都是」上：这两种情况下夜行、难找都不构成难遇见。
  const held =
    (Boolean(cfg.indoorDedupe) && yes(it.indoor)) || (Boolean(cfg.denseDedupe) && abundant);
  if (yes(it.nocturnal) && !held) add(w.nocturnal, "night");
  if (yes(it.short_window)) add(w.short_window, "window");
  if (yes(it.liked)) add(w.liked, "liked");
  if (yes(it.large)) add(w.large, "large");
  if (yes(it.narrow_range)) add(w.narrow_range, "narrow");
  if (yes(it.often_absent) && !held) add(w.often_absent, "absent");

  return { score: Number(s.toFixed(2)), tier: rarityFromScore(s), adj };
}

function main() {
  const calPath = argFile("cal", "rarity-calibrate-glm-5.1");
  // 探针脚本已随算法定稿删除，默认不找它的产物；标定输出本身已含全部 12 题。
  const probePath = argFile("probe", null);
  if (!calPath) throw new Error("no calibrate json");
  const cal = JSON.parse(readFileSync(calPath, "utf8")) as {
    model: string;
    rows: Array<Record<string, unknown>>;
  };
  const probe = probePath
    ? (JSON.parse(readFileSync(probePath, "utf8")) as {
        model: string;
        rows: Array<Record<string, unknown>>;
      })
    : null;
  const probeById = new Map<number, Record<string, unknown>>(
    (probe?.rows ?? []).filter((r) => !r.error).map((r) => [Number(r.id), r]),
  );
  // 标注取活的锚点文件，不用跑分时的快照——不然改了标注看不出来。
  const taxa = JSON.parse(readFileSync(join(root, "rarity-calibrate-taxa.json"), "utf8")) as Array<{
    id: number;
    user?: string;
    agent?: string;
  }>;
  const refById = new Map(
    taxa.map((t) => {
      const user = String(t.user ?? "").trim();
      return [t.id, { ref: user || String(t.agent ?? "").trim(), byUser: Boolean(user) }] as const;
    }),
  );

  const rows: Row[] = [];
  for (const r of cal.rows) {
    if (r.error) continue;
    const list = String(r.list_level ?? "");
    const calItems = (r.items ?? {}) as Record<string, unknown>;
    const p = probeById.get(Number(r.id));
    const pItems = (p?.items ?? {}) as Record<string, unknown>;
    const items: Record<string, Tri> = {};
    for (const [k, v] of Object.entries(calItems)) items[k] = tri(v);
    for (const [k, v] of Object.entries(pItems)) items[k] = tri(v);
    const hit = refById.get(Number(r.id));
    rows.push({
      id: Number(r.id),
      label: String(r.label),
      ref: hit?.ref ?? String(r.user || r.agent || "").trim(),
      byUser: hit?.byUser ?? Boolean(String(r.user ?? "").trim()),
      extinct: list === "extinct",
      list: (list === "extinct" ? "" : list) as Row["list"],
      items,
    });
  }

  console.log(`cal:   ${calPath}`);
  console.log(`probe: ${probePath ?? "（无，答案全在 cal）"}`);
  console.log(`模型 ${cal.model} | 物种 ${rows.length}\n`);

  const results = CONFIGS.map((cfg) => ({ cfg, out: rows.map((r) => score(r, cfg)) }));

  // 用改后的 rarity-scale-rubric.ts 本体再算一遍，核对上面「再并室内城镇」那列。
  const live = rows.map((r) => {
    if (r.extinct) return { score: 99, tier: "XR", adj: ["gate:extinct"] };
    const items = emptyItems();
    for (const k of SCALE_ITEM_KEYS) items[k] = r.items[k as ScaleItemKey] ?? null;
    const got = scoreFromScale(items, {
      sanyou: r.list === "sanyou",
      class_ii: r.list === "class_ii",
      class_i: r.list === "class_i",
    });
    return { score: Number(got.score.toFixed(2)), tier: got.rarity, adj: got.adjustments };
  });
  results.push({ cfg: { name: "现行文件", weights: BASE }, out: live });
  const width = Math.max(...results.map((r) => r.cfg.name.length)) + 1;

  const head = ["id", "物种".padEnd(14), "标注", ...results.map((r) => r.cfg.name.padEnd(width))].join(
    " ",
  );
  console.log(head);
  console.log("-".repeat(head.length + 20));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const cells = results.map(({ out }) => {
      const got = out[i]!;
      const d = r.ref ? collectibleRankFromTier(got.tier) - collectibleRankFromTier(r.ref) : null;
      const mark = d == null ? " " : d === 0 ? "✓" : d > 0 ? `+${d}` : String(d);
      return `${got.tier.padEnd(3)}${String(got.score).padStart(6)} ${mark}`.padEnd(width + 12);
    });
    console.log(
      `#${String(r.id).padStart(2)} ${r.label.padEnd(14)} ${(r.ref || "-").padEnd(4)} ${cells.join(" ")}`,
    );
  }

  const tally = (out: Array<{ tier: string }>, onlyUser: boolean) => {
    const pairs = rows
      .map((r, i) => ({ ref: r.ref, byUser: r.byUser, tier: out[i]!.tier, label: r.label }))
      .filter((p) => p.ref && (!onlyUser || p.byUser));
    const deltas = pairs.map(
      (p) => collectibleRankFromTier(p.tier) - collectibleRankFromTier(p.ref),
    );
    const bad = pairs
      .map((p, i) => ({ p, d: deltas[i]! }))
      .filter((x) => Math.abs(x.d) >= 2)
      .map((x) => `${x.p.label}${x.d > 0 ? "+" : ""}${x.d}`);
    const bias = deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1);
    return {
      n: pairs.length,
      hit: deltas.filter((d) => d === 0).length,
      within1: deltas.filter((d) => Math.abs(d) <= 1).length,
      bias,
      bad,
    };
  };

  for (const [title, onlyUser] of [
    ["=== 汇总：只看你标注的 ===", true],
    ["=== 汇总：全部（你的标注优先，缺则 agent 兜底）===", false],
  ] as const) {
    console.log(`\n${title}`);
    for (const { cfg, out } of results) {
      const m = tally(out, onlyUser);
      console.log(
        `${cfg.name.padEnd(width)} 命中 ${m.hit}/${m.n} | ≤1档 ${m.within1}/${m.n} | 偏移 ${m.bias >= 0 ? "+" : ""}${m.bias.toFixed(2)} | ≥2档 ${m.bad.length}` +
          (m.bad.length ? `（${m.bad.join("、")}）` : ""),
      );
    }
  }

  const detailName = process.argv.find((a) => a.startsWith("--detail="))?.split("=")[1]?.trim();
  const detail = results.find((x) => x.cfg.name === detailName) ?? results[0]!;
  console.log(`\n=== 「${detail.cfg.name}」下不一致的（含明细） ===`);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (!r.ref) continue;
    const got = detail.out[i]!;
    const d = collectibleRankFromTier(got.tier) - collectibleRankFromTier(r.ref);
    if (d === 0) continue;
    console.log(
      `#${String(r.id).padStart(2)} ${r.label.padEnd(14)} 标注 ${r.ref.padEnd(3)}${r.byUser ? "*" : " "} → ${got.tier.padEnd(3)} ${d > 0 ? "+" : ""}${d}  S=${got.score}  [${got.adj.join(",")}]`,
    );
  }
}

main();
