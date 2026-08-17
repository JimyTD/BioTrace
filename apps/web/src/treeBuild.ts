import type { CollectionEntry, Taxonomy, TaxonomyName } from "./api";
import { rarityCollectibleRank } from "./speciesSearch";

export const TREE_RANKS = [
  "kingdom",
  "phylum",
  "class",
  "order",
  "family",
  "genus",
  "species",
] as const;
export type TreeRank = (typeof TREE_RANKS)[number];

export const UNPLACED_LATIN = "__unplaced__";

export type TreeFolder = {
  kind: "folder";
  latin: string;
  rank: TreeRank | "unplaced";
  name: string;
  caption: string;
  count: number;
  coverUrl: string | null;
};

export type TreeLeaf = {
  kind: "leaf";
  entry: CollectionEntry;
};

export type TreeItem = TreeFolder | TreeLeaf;

export type TreeLayer = {
  title: string;
  lede: string;
  coverUrl: string | null;
  split: boolean;
  items: TreeItem[];
};

function latinKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function nameAt(tax: Taxonomy | null | undefined, rank: keyof Taxonomy): TaxonomyName | null {
  return tax?.[rank] ?? null;
}

export function homeRank(entry: CollectionEntry): keyof Taxonomy | null {
  const key = latinKey(entry.taxonKey);
  if (!key || !entry.taxonomy) return null;
  const ranks: (keyof Taxonomy)[] = [
    "species",
    "genus",
    "family",
    "order",
    "class",
    "phylum",
    "kingdom",
  ];
  for (const rank of ranks) {
    if (latinKey(entry.taxonomy[rank]?.name_la) === key) return rank;
  }
  return null;
}

export function isPlaced(entry: CollectionEntry) {
  return Boolean(latinKey(nameAt(entry.taxonomy, "kingdom")?.name_la));
}

export function countTreeKingdoms(entries: CollectionEntry[]) {
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = latinKey(nameAt(entry.taxonomy, "kingdom")?.name_la);
    if (key) seen.add(key);
  }
  return seen.size;
}

function pickCover(entries: CollectionEntry[]): CollectionEntry | null {
  let best: CollectionEntry | null = null;
  for (const entry of entries) {
    if (!best) {
      best = entry;
      continue;
    }
    const d = rarityCollectibleRank(entry.rarity) - rarityCollectibleRank(best.rarity);
    if (d > 0) best = entry;
    else if (d === 0 && Date.parse(entry.updatedAt) > Date.parse(best.updatedAt)) best = entry;
  }
  return best;
}

function displayName(entries: CollectionEntry[], rank: keyof Taxonomy, fallback: string) {
  for (const entry of entries) {
    const zh = nameAt(entry.taxonomy, rank)?.name_zh?.trim();
    if (zh) return zh;
  }
  for (const entry of entries) {
    const la = nameAt(entry.taxonomy, rank)?.name_la?.trim();
    if (la) return la;
  }
  return fallback;
}

function matchesPath(entry: CollectionEntry, path: string[]) {
  if (!isPlaced(entry)) return false;
  for (let i = 0; i < path.length; i++) {
    const rank = TREE_RANKS[i];
    if (!rank) return false;
    if (latinKey(nameAt(entry.taxonomy, rank)?.name_la) !== latinKey(path[i])) return false;
  }
  return true;
}

function rankIndex(rank: keyof Taxonomy | null) {
  if (!rank) return -1;
  return TREE_RANKS.indexOf(rank as TreeRank);
}

function groupByRank(entries: CollectionEntry[], rank: TreeRank) {
  const groups = new Map<string, { latin: string; subset: CollectionEntry[] }>();
  for (const entry of entries) {
    const raw = nameAt(entry.taxonomy, rank)?.name_la?.trim() ?? "";
    const key = latinKey(raw);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.subset.push(entry);
    else groups.set(key, { latin: raw, subset: [entry] });
  }
  return groups;
}

function sortName(item: TreeItem) {
  if (item.kind === "folder") {
    if (item.rank === "unplaced") return "\uFFFF";
    return item.name;
  }
  return item.entry.commonName || item.entry.scientificName || item.entry.taxonKey || "";
}

function sortItems(items: TreeItem[]) {
  const folders = items.filter((i): i is TreeFolder => i.kind === "folder");
  const leaves = items.filter((i): i is TreeLeaf => i.kind === "leaf");
  const byName = (a: TreeItem, b: TreeItem) => sortName(a).localeCompare(sortName(b), "zh");
  folders.sort(byName);
  leaves.sort(byName);
  return [...folders, ...leaves];
}

function folderFrom(subset: CollectionEntry[], rank: TreeRank, latin: string, caption: string): TreeFolder {
  const cover = pickCover(subset);
  return {
    kind: "folder",
    latin,
    rank,
    name: displayName(subset, rank, latin),
    caption,
    count: subset.length,
    coverUrl: cover?.coverDisplayUrl ?? null,
  };
}

export function buildTreeLayer(entries: CollectionEntry[], path: string[]): TreeLayer {
  if (path[0] === UNPLACED_LATIN) {
    const unplaced = entries.filter((e) => !isPlaced(e));
    const cover = pickCover(unplaced);
    return {
      title: "",
      lede: "",
      coverUrl: cover?.coverDisplayUrl ?? null,
      split: true,
      items: sortItems(unplaced.map((entry) => ({ kind: "leaf" as const, entry }))),
    };
  }

  if (path.length === 0) {
    const placed: CollectionEntry[] = [];
    const unplaced: CollectionEntry[] = [];
    for (const entry of entries) {
      if (isPlaced(entry)) placed.push(entry);
      else unplaced.push(entry);
    }
    const items: TreeItem[] = [];
    for (const { latin, subset } of groupByRank(placed, "kingdom").values()) {
      items.push(folderFrom(subset, "kingdom", latin, ""));
    }
    if (unplaced.length > 0) {
      const cover = pickCover(unplaced);
      items.push({
        kind: "folder",
        latin: UNPLACED_LATIN,
        rank: "unplaced",
        name: "",
        caption: "",
        count: unplaced.length,
        coverUrl: cover?.coverDisplayUrl ?? null,
      });
    }
    return {
      title: "",
      lede: "",
      coverUrl: null,
      split: false,
      items: sortItems(items),
    };
  }

  const scoped = entries.filter((e) => matchesPath(e, path));
  const parentRank = TREE_RANKS[path.length - 1];
  const childRank = TREE_RANKS[path.length];
  const parentLatin = path[path.length - 1] ?? "";
  const items: TreeItem[] = [];

  if (parentRank) {
    for (const entry of scoped) {
      if (homeRank(entry) === parentRank) {
        items.push({ kind: "leaf", entry });
      }
    }
  }

  const taken = new Set<string>();
  if (childRank) {
    const deeperEntries = scoped.filter((entry) => {
      const home = homeRank(entry);
      return !(home && rankIndex(home) <= rankIndex(parentRank));
    });
    for (const { latin, subset } of groupByRank(deeperEntries, childRank).values()) {
      const deeper = subset.some((e) => rankIndex(homeRank(e)) > rankIndex(childRank));
      const self = subset.find((e) => homeRank(e) === childRank);
      if (deeper) {
        items.push(folderFrom(subset, childRank, latin, ""));
      }
      if (self) items.push({ kind: "leaf", entry: self });
      if (!deeper && !self && subset.length > 0) {
        items.push(folderFrom(subset, childRank, latin, ""));
      }
      for (const entry of subset) taken.add(entry.id);
    }
  }
  for (const item of items) {
    if (item.kind === "leaf") taken.add(item.entry.id);
  }
  for (const entry of scoped) {
    if (!taken.has(entry.id)) items.push({ kind: "leaf", entry });
  }

  const cover = pickCover(scoped);
  return {
    title: parentRank ? displayName(scoped, parentRank, parentLatin) : "",
    lede:
      path.length >= 2
        ? displayName(scoped, TREE_RANKS[path.length - 2] ?? "kingdom", "")
        : "",
    coverUrl: cover?.coverDisplayUrl ?? null,
    split: true,
    items: sortItems(items),
  };
}

export function folderIsUnaryGenus(folder: TreeFolder, entries: CollectionEntry[], path: string[]) {
  if (folder.rank !== "genus") return false;
  const next = [...path, folder.latin];
  const layer = buildTreeLayer(entries, next);
  const leaves = layer.items.filter((i): i is TreeLeaf => i.kind === "leaf");
  return layer.items.length === 1 && leaves.length === 1;
}

export function unaryGenusEntry(folder: TreeFolder, entries: CollectionEntry[], path: string[]) {
  const next = [...path, folder.latin];
  const layer = buildTreeLayer(entries, next);
  const leaf = layer.items.find((i): i is TreeLeaf => i.kind === "leaf");
  return leaf?.entry ?? null;
}

export function parseTreePath(splat: string | undefined) {
  if (!splat) return [];
  return splat.split("/").filter(Boolean).map((seg) => decodeURIComponent(seg));
}

export function treePathUrl(path: string[]) {
  if (path.length === 0) return "/collection/tree";
  return `/collection/tree/${path.map((seg) => encodeURIComponent(seg)).join("/")}`;
}
