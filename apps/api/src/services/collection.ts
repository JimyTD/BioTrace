import { and, desc, eq, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { collectionEntries, observations, type Observation } from "../db/schema.js";
import { rarityCollectibleRank } from "../rarity/config.js";
import { collectionScientificName } from "../settle/taxon.js";

export async function upsertCollectionFromObservation(obs: Observation) {
  const { upsertCollectionForUser } = await import("./shared-progress.js");
  await upsertCollectionForUser(obs.userId, obs);
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
      scientificName: collectionScientificName(replacement),
      rarity: bestRarity,
      updatedAt: new Date(),
    })
    .where(eq(collectionEntries.id, entryId));
}

/** Fix broken covers / orphan entries when listing图鉴. */
export async function sanitizeUserCollection(userId: string) {
  const { rebuildCollectionTaxonForUser } = await import("./shared-progress.js");
  const entries = await db.query.collectionEntries.findMany({
    where: eq(collectionEntries.userId, userId),
  });

  for (const entry of entries) {
    await rebuildCollectionTaxonForUser(userId, entry.taxonKey);
  }
}

export async function repairCollectionAfterObservationDeleted(
  userId: string,
  deletedObsId: string,
  taxonKey: string | null,
) {
  await detachObservationFromCollection(userId, deletedObsId, taxonKey);
}
