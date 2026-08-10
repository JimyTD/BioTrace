import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { rarityCache } from "../db/schema.js";
import { rarityConfig } from "./config.js";

export async function readRarityCache(cacheKey: string) {
  const row = await db.query.rarityCache.findFirst({
    where: eq(rarityCache.cacheKey, cacheKey),
  });
  if (!row) return null;
  const ageMs = Date.now() - row.fetchedAt.getTime();
  const ttlMs = rarityConfig.cacheTtlDays * 24 * 60 * 60 * 1000;
  if (ageMs > ttlMs) return null;
  return row;
}

export async function writeRarityCache(input: {
  cacheKey: string;
  rarity: string;
  occurrenceCount: number | null;
  gbifUsageKey: number | null;
  source: string;
}) {
  const now = new Date();
  const existing = await db.query.rarityCache.findFirst({
    where: eq(rarityCache.cacheKey, input.cacheKey),
  });
  if (existing) {
    await db
      .update(rarityCache)
      .set({
        rarity: input.rarity,
        occurrenceCount: input.occurrenceCount,
        gbifUsageKey: input.gbifUsageKey,
        source: input.source,
        fetchedAt: now,
      })
      .where(eq(rarityCache.cacheKey, input.cacheKey));
    return;
  }
  await db.insert(rarityCache).values({
    cacheKey: input.cacheKey,
    rarity: input.rarity,
    occurrenceCount: input.occurrenceCount,
    gbifUsageKey: input.gbifUsageKey,
    source: input.source,
    fetchedAt: now,
  });
}
