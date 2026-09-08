import Fuse from "fuse.js";
import { match, pinyin } from "pinyin-pro";
import type { CollectionEntry } from "./api";

export type SpeciesSort = "recent" | "rarity" | "name";

/** Higher = rarer. Unknown tiers sort last. */
const RARITY_RANK: Record<string, number> = {
  XR: 7,
  LR: 6,
  UR: 5,
  SSR: 4,
  SR: 3,
  R: 2,
  N: 1,
};

/** Chip order: common → rare. */
export const RARITY_CHIP_ORDER = ["N", "R", "SR", "SSR", "UR", "LR", "XR"] as const;

export function rarityCollectibleRank(tier: string): number {
  return RARITY_RANK[tier] ?? 0;
}

function syllablesOf(name: string): string[] {
  if (!name.trim()) return [];
  const raw = pinyin(name, {
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
    v: true,
  });
  const parts = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
  return parts.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean);
}

export type IndexedNamed<T extends { id: string; commonName: string | null; scientificName: string | null }> = T & {
  pinyin: string;
  pinyinCompact: string;
  initials: string;
};

export type IndexedSpecies = IndexedNamed<CollectionEntry>;

export function indexNamed<T extends { id: string; commonName: string | null; scientificName: string | null }>(
  entry: T,
): IndexedNamed<T> {
  const syllables = syllablesOf(entry.commonName ?? "");
  return {
    ...entry,
    pinyin: syllables.join(" "),
    pinyinCompact: syllables.join(""),
    initials: syllables.map((s) => s[0] ?? "").join(""),
  };
}

export function indexSpecies(entry: CollectionEntry): IndexedSpecies {
  return indexNamed(entry);
}

function haystack(entry: {
  commonName: string | null;
  scientificName: string | null;
  pinyin: string;
  pinyinCompact: string;
  initials: string;
}): string {
  return [entry.commonName, entry.scientificName, entry.pinyin, entry.pinyinCompact, entry.initials]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildNamedFuse<T extends IndexedNamed<{ id: string; commonName: string | null; scientificName: string | null }>>(
  entries: T[],
) {
  return new Fuse(entries, {
    keys: [
      { name: "commonName", weight: 2 },
      { name: "scientificName", weight: 1.6 },
      { name: "pinyin", weight: 1.4 },
      { name: "pinyinCompact", weight: 1.4 },
      { name: "initials", weight: 0.7 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 1,
    isCaseSensitive: false,
  });
}

export function buildSpeciesFuse(entries: IndexedSpecies[]) {
  return buildNamedFuse(entries);
}

export function filterNamed<T extends IndexedNamed<{ id: string; commonName: string | null; scientificName: string | null }>>(
  entries: T[],
  fuse: Fuse<T> | null,
  query: string,
): T[] {
  const q = normalizeQuery(query);
  if (!q) return entries;

  const compact = q.replace(/\s+/g, "");
  const substringHits = entries.filter((e) => {
    const hay = haystack(e);
    if (hay.includes(q) || e.pinyinCompact.includes(compact) || e.initials.startsWith(compact)) {
      return true;
    }
    const name = e.commonName?.trim();
    return Boolean(
      name &&
        match(name, q, {
          precision: "start",
          continuous: false,
          space: "ignore",
          insensitive: true,
          v: true,
        }),
    );
  });
  if (q.length <= 1 || !fuse) return substringHits;

  const fused = fuse.search(q).map((r) => r.item);
  const seen = new Set(substringHits.map((e) => e.id));
  return [...substringHits, ...fused.filter((e) => !seen.has(e.id))];
}

export function filterSpecies(
  entries: IndexedSpecies[],
  fuse: Fuse<IndexedSpecies> | null,
  query: string,
): IndexedSpecies[] {
  return filterNamed(entries, fuse, query);
}

export function sortSpecies(entries: IndexedSpecies[], sort: SpeciesSort): IndexedSpecies[] {
  const copy = [...entries];
  if (sort === "recent") {
    copy.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return copy;
  }
  if (sort === "rarity") {
    copy.sort((a, b) => {
      const d = rarityCollectibleRank(b.rarity) - rarityCollectibleRank(a.rarity);
      if (d !== 0) return d;
      return speciesEntryName(a).localeCompare(speciesEntryName(b), "zh");
    });
    return copy;
  }
  copy.sort((a, b) => speciesEntryName(a).localeCompare(speciesEntryName(b), "zh"));
  return copy;
}

export function speciesEntryName(
  entry: { commonName?: string | null; scientificName?: string | null; taxonKey?: string | null },
  unnamed = "",
): string {
  return entry.commonName || entry.scientificName || entry.taxonKey || unnamed;
}

export function raritiesInEntries(entries: CollectionEntry[]): string[] {
  const present = new Set(entries.map((e) => e.rarity));
  const known = RARITY_CHIP_ORDER.filter((r) => present.has(r));
  const extra = [...present].filter((r) => !known.includes(r as (typeof RARITY_CHIP_ORDER)[number]));
  extra.sort();
  return [...known, ...extra];
}
