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

/** 除档位外一并留下判据：得分、12 题答案、生效模型、采样次数，供后台查证某一行。 */
export async function writeRarityCache(input: {
  cacheKey: string;
  rarity: string;
  source: string;
  score: number | null;
  itemsJson: string | null;
  adjustmentsJson: string | null;
  model: string | null;
  samples: number | null;
  listLevel: string | null;
  reasonsJson: string | null;
}) {
  const now = new Date();
  const values = {
    rarity: input.rarity,
    source: input.source,
    score: input.score,
    itemsJson: input.itemsJson,
    adjustmentsJson: input.adjustmentsJson,
    model: input.model,
    samples: input.samples,
    listLevel: input.listLevel,
    reasonsJson: input.reasonsJson,
    fetchedAt: now,
  };
  const existing = await db.query.rarityCache.findFirst({
    where: eq(rarityCache.cacheKey, input.cacheKey),
  });
  if (existing) {
    await db.update(rarityCache).set(values).where(eq(rarityCache.cacheKey, input.cacheKey));
    return;
  }
  await db.insert(rarityCache).values({ cacheKey: input.cacheKey, ...values });
}
