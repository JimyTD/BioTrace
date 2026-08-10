import { and, desc, eq, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { collectionEntries, observations, type Observation } from "../db/schema.js";
import { rarityCollectibleRank } from "../rarity/config.js";

export async function upsertCollectionFromObservation(obs: Observation) {
  if (!obs.taxonKey || !obs.rarity || obs.status !== "settled") return;

  const existing = await db.query.collectionEntries.findFirst({
    where: and(
      eq(collectionEntries.userId, obs.userId),
      eq(collectionEntries.taxonKey, obs.taxonKey),
    ),
  });

  const now = new Date();
  if (!existing) {
    await db.insert(collectionEntries).values({
      id: crypto.randomUUID(),
      userId: obs.userId,
      taxonKey: obs.taxonKey,
      commonName: obs.commonName,
      scientificName: obs.scientificName,
      rarity: obs.rarity,
      coverObservationId: obs.id,
      firstCollectedAt: now,
      updatedAt: now,
    });
    return;
  }

  const nextRarity =
    rarityCollectibleRank(obs.rarity) > rarityCollectibleRank(existing.rarity)
      ? obs.rarity
      : existing.rarity;

  await db
    .update(collectionEntries)
    .set({
      commonName: obs.commonName ?? existing.commonName,
      scientificName: obs.scientificName ?? existing.scientificName,
      rarity: nextRarity,
      coverObservationId: obs.id,
      updatedAt: now,
    })
    .where(eq(collectionEntries.id, existing.id));
}

/** Detach an observation from collection (delete / reidentify start). */
export async function detachObservationFromCollection(
  userId: string,
  observationId: string,
  taxonKey: string | null,
) {
  const candidates = await db.query.collectionEntries.findMany({
    where: and(
      eq(collectionEntries.userId, userId),
      taxonKey
        ? or(
            eq(collectionEntries.coverObservationId, observationId),
            eq(collectionEntries.taxonKey, taxonKey),
          )
        : eq(collectionEntries.coverObservationId, observationId),
    ),
  });

  for (const entry of candidates) {
    await refreshCollectionEntry(entry.id, userId, entry.taxonKey, observationId);
  }
}

async function refreshCollectionEntry(
  entryId: string,
  userId: string,
  taxonKey: string,
  excludeObservationId?: string,
) {
  const settled = await db.query.observations.findMany({
    where: and(
      eq(observations.userId, userId),
      eq(observations.taxonKey, taxonKey),
      eq(observations.status, "settled"),
    ),
    orderBy: [desc(observations.settledAt)],
  });

  const replacement = settled.find((o) => o.id !== excludeObservationId) ?? null;

  if (!replacement) {
    await db.delete(collectionEntries).where(eq(collectionEntries.id, entryId));
    return;
  }

  let bestRarity = replacement.rarity ?? "R";
  for (const o of settled) {
    if (excludeObservationId && o.id === excludeObservationId) continue;
    if (rarityCollectibleRank(o.rarity ?? "R") > rarityCollectibleRank(bestRarity)) {
      bestRarity = o.rarity ?? bestRarity;
    }
  }

  await db
    .update(collectionEntries)
    .set({
      coverObservationId: replacement.id,
      commonName: replacement.commonName,
      scientificName: replacement.scientificName,
      rarity: bestRarity,
      updatedAt: new Date(),
    })
    .where(eq(collectionEntries.id, entryId));
}

/** Fix broken covers / orphan entries when listing图鉴. */
export async function sanitizeUserCollection(userId: string) {
  const entries = await db.query.collectionEntries.findMany({
    where: eq(collectionEntries.userId, userId),
  });

  for (const entry of entries) {
    let coverOk = false;
    if (entry.coverObservationId) {
      const cover = await db.query.observations.findFirst({
        where: and(
          eq(observations.id, entry.coverObservationId),
          eq(observations.userId, userId),
          eq(observations.status, "settled"),
          eq(observations.taxonKey, entry.taxonKey),
        ),
      });
      coverOk = Boolean(cover);
    }
    if (!coverOk) {
      await refreshCollectionEntry(entry.id, userId, entry.taxonKey);
    }
  }
}

export async function repairCollectionAfterObservationDeleted(
  userId: string,
  deletedObsId: string,
  taxonKey: string | null,
) {
  await detachObservationFromCollection(userId, deletedObsId, taxonKey);
}
