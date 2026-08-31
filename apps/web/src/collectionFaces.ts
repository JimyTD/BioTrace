import type { CollectionEntry } from "./api";
import { rarityCollectibleRank, speciesEntryName } from "./speciesSearch";

const FACE_COUNT = 4;

function kingdomKey(entry: CollectionEntry): string | null {
  const latin = entry.taxonomy?.kingdom?.name_la?.trim().toLowerCase();
  return latin || null;
}

function faceRank(a: CollectionEntry, b: CollectionEntry): number {
  const d = rarityCollectibleRank(b.rarity) - rarityCollectibleRank(a.rarity);
  if (d !== 0) return d;
  return speciesEntryName(a).localeCompare(speciesEntryName(b), "zh");
}

/**
 * 图鉴脸上那几张种的照片。
 * 每个界先取该界稀有度最高的一种；不满 4 再按稀有度从高到低补；同稀有度按中文名。
 * 没有封面的种不进脸。种不够就几张。
 */
export function pickCollectionFaces(entries: CollectionEntry[], n = FACE_COUNT): CollectionEntry[] {
  const withCover = entries.filter((e) => e.coverDisplayUrl);
  const byKingdom = new Map<string, CollectionEntry[]>();
  for (const entry of withCover) {
    const key = kingdomKey(entry);
    if (!key) continue;
    const group = byKingdom.get(key);
    if (group) group.push(entry);
    else byKingdom.set(key, [entry]);
  }

  const picked: CollectionEntry[] = [];
  const used = new Set<string>();
  for (const key of [...byKingdom.keys()].sort()) {
    const best = [...(byKingdom.get(key) ?? [])].sort(faceRank)[0];
    if (!best) continue;
    picked.push(best);
    used.add(best.id);
    if (picked.length >= n) return picked;
  }

  const rest = withCover.filter((e) => !used.has(e.id)).sort(faceRank);
  for (const entry of rest) {
    if (picked.length >= n) break;
    picked.push(entry);
  }
  return picked;
}
