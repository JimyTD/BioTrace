/**
 * 收集条目的分类学小工具。
 *
 * 曾经这里是整棵「文件夹树」的构建器（buildTreeLayer 等）。
 * 物种树改为 3D 场景后那套逐层宫格全部废弃，节点模型见
 * `src/tree/treeModel.ts`。这里只留下别处仍在用的判据。
 */
import type { CollectionEntry, Taxonomy } from "./api";

/** 连「界」都没识别出来的条目：不属于任何枝，在 3D 树里没有位置。 */
export const UNPLACED_LATIN = "__unplaced__";

function latinKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

/** 有没有落在分类骨架上 —— 判据是有没有 kingdom。 */
export function isPlaced(entry: CollectionEntry) {
  return Boolean(latinKey(entry.taxonomy?.kingdom?.name_la));
}

/**
 * 这个条目「住」在哪一级。
 *
 * 识别不总能到种：只到科时 finestReliableRank = "family"，
 * 它就是科级的一个叶子。所以同一层可以同时有可下钻的枝和到此为止的叶。
 */
export function homeRank(entry: CollectionEntry): keyof Taxonomy | null {
  const key = latinKey(entry.taxonKey);
  if (!key || !entry.taxonomy) return null;
  const ranks: (keyof Taxonomy)[] = [
    "species", "genus", "family", "order", "class", "phylum", "kingdom",
  ];
  for (const rank of ranks) {
    if (latinKey(entry.taxonomy[rank]?.name_la) === key) return rank;
  }
  return null;
}

/** 收集覆盖了几个界。用在图鉴首页的「物种树」入口上。 */
export function countTreeKingdoms(entries: CollectionEntry[]) {
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = latinKey(entry.taxonomy?.kingdom?.name_la);
    if (key) seen.add(key);
  }
  return seen.size;
}
