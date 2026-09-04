/**
 * 物种树的节点模型：把「静态全景骨架」和「我的收集」合并成一棵树。
 *
 * ── 三种节点来源 ────────────────────────────────────────────
 *   backbone  界→门→纲→目，来自 GBIF，人人相同，内置不查库
 *   grown     科→属→种，从我的收集条目里长出来
 *   filler    装饰性假枝，只为表达规模，不可点击
 *
 * ── 为什么根系（细菌/古菌/病毒）是假的 ─────────────────────
 * 真骨架里根系有 1886 个节点，比整个树冠（1429）还大，会压倒主角；
 * 而且名字是 UBA10199 / JACPQU01 这类宏基因组代号，没有可读性；
 * 用户也永远不会点进去。所以根系整段用 filler 生成，
 * 茂密度由渲染层自由定，不受真实节点数绑架。
 * 万一真拍到蓝藻水华：条目自带完整 taxonomy，会在假枝丛里长出一根真枝。
 *
 * ── 节点 id 的形式：`<rank序号>:<拉丁名>` ───────────────────
 * rank 必须参与，因为拉丁名在同一界内会重复（单型分类单元）：
 *   Diplura 纲 ← Arthropoda      「双尾纲」
 *   Diplura 目 ← Diplura(纲)     「双尾目」，父是同名的纲
 * 不带 rank 的话这些节点会自己当自己的父级 → 建树成环。
 */
import { t, type MessageKey } from "@biotrace/messages";
import type { CollectionEntry, Taxonomy } from "../api";
import { BACKBONE_ZH } from "../data/backboneZh";
import backboneRaw from "../data/backbone.json";

export const RANKS = ["kingdom", "phylum", "class", "order", "family", "genus", "species"] as const;
export type Rank = (typeof RANKS)[number];

/** 三段式分区。见 docs/wip/物种树-结构议题.md §4.2「高度即可及性」。 */
export type Zone = "crown" | "basal" | "root";

export type TreeNode = {
  id: string;
  /** rank 序号，0=界 … 6=种 */
  lvl: number;
  la: string;
  /** 中文名；没有通行中译时为 null，界面显示拉丁名 */
  zh: string | null;
  kingdom: string;
  zone: Zone;
  src: "backbone" | "grown" | "filler";
  parent: TreeNode | null;
  ch: TreeNode[];
  /** 该支下的收集条目数（自底向上累加） */
  got: number;
  /** 住在这一级的条目（识别只到科时就住在科级） */
  own: CollectionEntry[];
  /** 代表照片 */
  coverUrl: string | null;
  /** 末端且非种：数据不再细分（如 filler 枝梢） */
  term: boolean;
  /** 在父级 ch 中的序号。渲染层用它做确定性的方位/扰动。 */
  sib: number;
  /**
   * 装饰性叶片数。
   *
   * 为什么必须有：骨架只到「目」，目下面没有真实节点，
   * 全树总览时树冠会是一把光秃的枝 —— 而雄伟感恰恰来自海量叶点。
   * 所以骨架末端要生成表达规模的假叶簇（这就是「机制 2」）。
   * 数量由 id 的 hash 定，形态因此恒定：同一个目永远长成同一个样子。
   */
  fillLeaves: number;
};

type RawDoc = {
  ranks: string[];
  zones: Record<string, string>;
  fields: string[];
  nodes: (string | number | null)[][];
};

const DOC = backboneRaw as unknown as RawDoc;

/** 根系三界。不在 backbone.json 里，此处补上界节点，其下用 filler 填。
 *  中文名不在 backboneZh（那会被 check-zh.py 判死键），走 messages 的 tree3d.*。 */
const ROOT_KINGDOMS: { la: string; zhKey: MessageKey; fill: number }[] = [
  { la: "Bacteria", zhKey: "tree3d.kingdomBacteria", fill: 7 },
  { la: "Archaea", zhKey: "tree3d.kingdomArchaea", fill: 5 },
  { la: "Viruses", zhKey: "tree3d.kingdomViruses", fill: 4 },
];

export function nodeId(lvl: number, la: string) {
  return `${lvl}:${la}`;
}

export function labelOf(n: TreeNode) {
  return n.zh ?? n.la;
}

/** 一茬最多几根可认的子枝。和总览 8 界同一只手数，不是某个类群的特例。 */
export const FAN_BATCH = 8;

/**
 * 每一级分茬、展开共用的排序：有权威中文的在前，没有的排后面。
 * 同组内保持建树时的 sib，形态稳定。
 */
export function orderKids(kids: TreeNode[]): TreeNode[] {
  return kids.slice().sort((a, b) => {
    const az = a.zh ? 0 : 1;
    const bz = b.zh ? 0 : 1;
    if (az !== bz) return az - bz;
    if (a.sib !== b.sib) return a.sib - b.sib;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function batchKids(kids: TreeNode[], page: number) {
  const ordered = orderKids(kids);
  const pages = Math.max(1, Math.ceil(ordered.length / FAN_BATCH));
  /* 不绕圈。最后一茬没有「下一批」，第一茬没有「上一批」。 */
  const p = Math.max(0, Math.min(pages - 1, page | 0));
  const start = p * FAN_BATCH;
  return {
    ordered,
    shown: ordered.slice(start, start + FAN_BATCH),
    pages,
    page: p,
  };
}

function mkNode(o: Partial<TreeNode> & { id: string; lvl: number; la: string }): TreeNode {
  return {
    zh: null,
    kingdom: "",
    zone: "crown",
    src: "backbone",
    parent: null,
    ch: [],
    got: 0,
    own: [],
    coverUrl: null,
    term: false,
    sib: 0,
    fillLeaves: 0,
    ...o,
  };
}

/** 确定性 hash → [0,1)。必须用 imul：普通乘法超过 2^53 会丢低位使 hash 退化。 */
function h01(a: number, b: number) {
  let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 15), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function strHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type SpeciesTree = {
  root: TreeNode;
  /** id → 节点，用于 URL ↔ 焦点互转 */
  byId: Map<string, TreeNode>;
  totalGot: number;
  /** 骨架节点数（不含 filler） */
  realCount: number;
};

/**
 * 建树。
 * 骨架先铺开，再把收集条目挂上去；条目路径上缺失的层级即时补出（src="grown"）。
 */
export function buildSpeciesTree(entries: CollectionEntry[]): SpeciesTree {
  const F: Record<string, number> = {};
  DOC.fields.forEach((f, i) => (F[f] = i));
  const byId = new Map<string, TreeNode>();

  const root = mkNode({ id: "root", lvl: -1, la: "Vita", zh: t("tree3d.rootLife"), src: "backbone" });

  // ── 1. 骨架 ──
  for (const row of DOC.nodes) {
    const id = row[F.id] as string;
    const la = row[F.la] as string;
    const lvl = row[F.rank] as number;
    const kingdom = row[F.kingdom] as string;
    const n = mkNode({
      id,
      lvl,
      la,
      zh: BACKBONE_ZH[id] ?? (row[F.zh] as string | null) ?? null,
      kingdom,
      zone: (DOC.zones[kingdom] as Zone) ?? "crown",
      src: "backbone",
    });
    byId.set(id, n);
  }
  for (const row of DOC.nodes) {
    const n = byId.get(row[F.id] as string)!;
    const pid = row[F.parentId] as string | null;
    const p = pid ? byId.get(pid) : null;
    n.parent = p ?? root;
    (p ?? root).ch.push(n);
  }

  // ── 2. 根系三界 + 假枝丛 ──
  for (const rk of ROOT_KINGDOMS) {
    const k = mkNode({
      id: nodeId(0, rk.la),
      lvl: 0,
      la: rk.la,
      zh: t(rk.zhKey),
      kingdom: rk.la,
      zone: "root",
      src: "backbone", // 界本身是真的，其下才是假的
      parent: root,
    });
    byId.set(k.id, k);
    root.ch.push(k);
    growFiller(k, rk.fill, 3);
  }

  const realCount = byId.size;

  // ── 3. 挂收集条目 ──
  for (const e of entries) {
    if (!e.taxonomy) continue;
    attachEntry(root, byId, e, e.taxonomy);
  }

  // ── 4. 自底向上累加 got / 选封面 ──
  rollup(root);
  // ── 5. 序号 + 装饰性叶片 ──
  finalize(root, 0);
  // 树冠三界叶量拉齐：不跟真实末端数走（动物 659 端 vs 植物 253）。
  equalizeCrownFoliage(root);

  return { root, byId, totalGot: root.got, realCount };
}

/**
 * 每个末端枝挂多少装饰叶。
 *
 * 数值偏大是有意的：骨架只有 4 层（界→目），比原型的 6 层少两级分叉，
 * 末端枝数量少得多。要靠每枝多挂叶才能凑出雾状树冠的密度 ——
 * 「雄伟感来自海量叶点」是这棵树的立命之本（见 §4.3）。
 */
const FILL_LEAF_BY_LVL = [0, 30, 40, 58, 26, 14, 0];

function finalize(n: TreeNode, sib: number) {
  n.sib = sib;
  if (n.ch.length === 0 && n.lvl >= 0 && n.lvl < 6) {
    // 末端且不是种 → 用假叶簇表达「这里有很多物种，你还没走进去」
    const seed = strHash(n.id);
    const base = FILL_LEAF_BY_LVL[n.lvl] ?? 12;
    n.fillLeaves = Math.max(6, Math.round(base * (0.55 + 0.9 * h01(seed, 17))));
  }
  n.ch.forEach((c, i) => finalize(c, i));
}

/**
 * 树冠三界的装饰叶总量拉到同一预算。
 *
 * 每枝叶数仍由 hash 定（同一目永远同形），但三蓬雾的总量不跟骨架末端数走。
 * 这是视觉作弊，不是「把动物画小」：植物 / 真菌同样按这个预算画。
 */
const CROWN_FILL_BUDGET = 12000;

function countFillLeaves(n: TreeNode): number {
  let s = n.fillLeaves;
  for (const c of n.ch) s += countFillLeaves(c);
  return s;
}

function scaleFillLeaves(n: TreeNode, k: number) {
  if (n.fillLeaves > 0) n.fillLeaves = Math.max(6, Math.round(n.fillLeaves * k));
  for (const c of n.ch) scaleFillLeaves(c, k);
}

function equalizeCrownFoliage(root: TreeNode) {
  for (const k of root.ch) {
    if (k.zone !== "crown") continue;
    const t = countFillLeaves(k);
    if (t < 1) continue;
    scaleFillLeaves(k, CROWN_FILL_BUDGET / t);
  }
}

/**
 * 装饰性假枝。用节点 id 的 hash 决定分支数，所以同一个界永远长成同一个样子
 * ——「假」不等于「随机」，形态必须稳定，否则每次打开树都变样。
 */
function growFiller(parent: TreeNode, breadth: number, depthLeft: number) {
  if (depthLeft <= 0) {
    parent.term = true;
    return;
  }
  const seed = strHash(parent.id);
  const n = Math.max(2, Math.round(breadth * (0.6 + 0.8 * h01(seed, depthLeft))));
  for (let i = 0; i < n; i++) {
    const c = mkNode({
      id: `${parent.id}/f${i}`,
      lvl: parent.lvl + 1,
      la: "",
      zh: null,
      kingdom: parent.kingdom,
      zone: parent.zone,
      src: "filler",
      parent,
    });
    parent.ch.push(c);
    growFiller(c, Math.max(2, breadth - 2), depthLeft - 1);
  }
}

const TAX_RANKS: (keyof Taxonomy)[] = [
  "kingdom",
  "phylum",
  "class",
  "order",
  "family",
  "genus",
  "species",
];

/** 条目最细的可靠阶元 = 它「住」在哪一级。 */
function homeLvl(tax: Taxonomy): number {
  for (let i = TAX_RANKS.length - 1; i >= 0; i--) {
    if (tax[TAX_RANKS[i]]?.name_la?.trim()) return i;
  }
  return -1;
}

/**
 * 把一个条目挂到树上。
 *
 * 难点：条目的 taxonomy 路径和骨架不一定对得上 ——
 * GBIF 骨架里没有 Reptilia / Actinopterygii（鱼类的目直接挂在门下），
 * 而 AI 识别给的 taxonomy 里可能有 class="Reptilia"。
 * 所以逐级查找时**允许跳级**：某一级在骨架里找不到就跳过，
 * 用下一级继续找父节点，都找不到才即时补建。
 */
function attachEntry(
  root: TreeNode,
  byId: Map<string, TreeNode>,
  e: CollectionEntry,
  tax: Taxonomy,
) {
  const home = homeLvl(tax);
  if (home < 0) return; // 未归位：连界都没有，不上树

  let cur = root;
  let lastMatched = -1;

  for (let lvl = 0; lvl <= home; lvl++) {
    const la = tax[TAX_RANKS[lvl]]?.name_la?.trim();
    if (!la) continue;
    const id = nodeId(lvl, la);
    let n = byId.get(id);

    if (n) {
      // 命中骨架。若它不是 cur 的后代（跳级导致），仍以它为准 —— 骨架是权威
      cur = n;
      lastMatched = lvl;
      continue;
    }

    // 骨架里没有 → 即时补建（科/属/种一定走这里，因为骨架只到目）
    n = mkNode({
      id,
      lvl,
      la,
      zh: tax[TAX_RANKS[lvl]]?.name_zh?.trim() || BACKBONE_ZH[id] || null,
      kingdom: cur.kingdom || la,
      zone: cur.zone,
      src: "grown",
      parent: cur,
    });
    byId.set(id, n);
    cur.ch.push(n);
    cur = n;
    lastMatched = lvl;
  }

  if (lastMatched < 0) return;
  cur.own.push(e);
}

function rollup(n: TreeNode): number {
  let got = n.own.length;
  for (const c of n.ch) got += rollup(c);
  n.got = got;
  if (!n.coverUrl) {
    const mine = n.own.find((e) => e.coverDisplayUrl);
    n.coverUrl = mine?.coverDisplayUrl ?? null;
  }
  if (!n.coverUrl) {
    for (const c of n.ch) {
      if (c.coverUrl) {
        n.coverUrl = c.coverUrl;
        break;
      }
    }
  }
  return got;
}

/** 从节点走到根的链，用于面包屑。 */
export function chainOf(n: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  let c: TreeNode | null = n;
  while (c && c.lvl >= 0) {
    out.unshift(c);
    c = c.parent;
  }
  return out;
}

/** 该级下所有收集条目（含后代），用于详情视图。 */
export function collectEntries(n: TreeNode, cap = 400): CollectionEntry[] {
  const out: CollectionEntry[] = [];
  const walk = (x: TreeNode) => {
    if (out.length >= cap) return;
    for (const e of x.own) {
      out.push(e);
      if (out.length >= cap) return;
    }
    for (const c of x.ch) walk(c);
  };
  walk(n);
  return out;
}
