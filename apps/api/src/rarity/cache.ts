import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { rarityCache } from "../db/schema.js";

export async function readRarityCache(cacheKey: string) {
  return (
    (await db.query.rarityCache.findFirst({
      where: eq(rarityCache.cacheKey, cacheKey),
    })) ?? null
  );
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
