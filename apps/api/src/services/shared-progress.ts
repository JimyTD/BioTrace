import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  collectionEntries,
  observations,
  sharedCollectionCredits,
  tripMembers,
  type Observation,
} from "../db/schema.js";
import { collectibleRankFromTier } from "../rarity/scale-rubric.js";
import { collectionScientificName } from "../settle/taxon.js";
import { rebuildPetTaxonForUser } from "./pets.js";

async function memberIdsOfTrip(tripId: string): Promise<string[]> {
  const rows = await db.query.tripMembers.findMany({
    where: eq(tripMembers.tripId, tripId),
    columns: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function upsertCollectionForUser(userId: string, obs: Observation) {
  if (!obs.taxonKey || obs.status !== "settled") return;
  // 驯养进宠物图鉴、不碰野生卡；野生进现有图鉴。两边都按源观察重算，
  // 身份从家野翻转时对侧图鉴会回缩。
  if (obs.domesticated) {
    await rebuildPetTaxonForUser(userId, obs.taxonKey);
    await rebuildCollectionTaxonForUser(userId, obs.taxonKey);
    return;
  }
  if (!obs.rarity) return;

  const existing = await db.query.collectionEntries.findFirst({
    where: and(eq(collectionEntries.userId, userId), eq(collectionEntries.taxonKey, obs.taxonKey)),
  });

  const now = new Date();
  if (!existing) {
    await db.insert(collectionEntries).values({
      id: crypto.randomUUID(),
      userId,
      taxonKey: obs.taxonKey,
      commonName: obs.commonName,
      scientificName: collectionScientificName(obs),
      rarity: obs.rarity,
      coverObservationId: obs.id,
      firstCollectedAt: now,
      updatedAt: now,
    });
    await rebuildPetTaxonForUser(userId, obs.taxonKey);
    return;
  }

  const nextRarity =
    collectibleRankFromTier(obs.rarity) > collectibleRankFromTier(existing.rarity)
      ? obs.rarity
      : existing.rarity;

  // Prefer keeping own photo as cover when already own; otherwise may point at shared obs.
  const coverObservationId =
    existing.coverObservationId && existing.coverObservationId !== obs.id
      ? existing.coverObservationId
      : obs.id;

  await db
    .update(collectionEntries)
    .set({
      commonName: obs.commonName ?? existing.commonName,
      scientificName: collectionScientificName(obs) ?? existing.scientificName,
      rarity: nextRarity,
      coverObservationId: collectibleRankFromTier(obs.rarity) >= collectibleRankFromTier(existing.rarity)
        ? obs.id
        : coverObservationId,
      updatedAt: now,
    })
    .where(eq(collectionEntries.id, existing.id));
  await rebuildPetTaxonForUser(userId, obs.taxonKey);
}

async function recordCredit(userId: string, obs: Observation) {
  if (!obs.taxonKey) return;
  await db
    .insert(sharedCollectionCredits)
    .values({
      userId,
      tripId: obs.tripId,
      observationId: obs.id,
      taxonKey: obs.taxonKey,
    })
    .onConflictDoNothing();
}

/**
 * Grant shared collection progress to specific users (join backfill) or all current members.
 */
export async function grantSharedProgressForObservation(
  obs: Observation,
  onlyUserIds?: string[],
): Promise<void> {
  if (obs.status !== "settled" || !obs.taxonKey) return;

  const memberIds = onlyUserIds ?? (await memberIdsOfTrip(obs.tripId));
  for (const uid of memberIds) {
    await upsertCollectionForUser(uid, obs);
    if (uid !== obs.userId) {
      await recordCredit(uid, obs);
    }
  }

}

export async function grantSharedProgressToAllMembers(obs: Observation): Promise<void> {
  await grantSharedProgressForObservation(obs);
}

export async function rebuildCollectionTaxonForUser(userId: string, taxonKey: string) {
  const own = await db.query.observations.findMany({
    where: and(
      eq(observations.userId, userId),
      eq(observations.taxonKey, taxonKey),
      eq(observations.status, "settled"),
    ),
    orderBy: [desc(observations.settledAt)],
  });

  const credits = await db.query.sharedCollectionCredits.findMany({
    where: and(
      eq(sharedCollectionCredits.userId, userId),
      eq(sharedCollectionCredits.taxonKey, taxonKey),
    ),
  });
  const creditObsIds = credits.map((c) => c.observationId);
  const credited =
    creditObsIds.length > 0
      ? await db.query.observations.findMany({
          where: and(
            inArray(observations.id, creditObsIds),
            eq(observations.status, "settled"),
            eq(observations.taxonKey, taxonKey),
          ),
        })
      : [];

  const sources = [...own, ...credited].filter((o) => !o.domesticated);
  const ownWild = own.filter((o) => !o.domesticated);
  const existing = await db.query.collectionEntries.findFirst({
    where: and(eq(collectionEntries.userId, userId), eq(collectionEntries.taxonKey, taxonKey)),
  });

  if (sources.length === 0) {
    if (existing) await db.delete(collectionEntries).where(eq(collectionEntries.id, existing.id));
    return;
  }

  let best = sources[0]!;
  for (const o of sources) {
    if (collectibleRankFromTier(o.rarity ?? "R") > collectibleRankFromTier(best.rarity ?? "R")) {
      best = o;
    }
  }
  // Prefer own cover for privacy
  const ownBest = ownWild.sort(
    (a, b) => collectibleRankFromTier(b.rarity ?? "R") - collectibleRankFromTier(a.rarity ?? "R"),
  )[0];
  const cover = ownBest ?? best;

  const now = new Date();
  if (!existing) {
    await db.insert(collectionEntries).values({
      id: crypto.randomUUID(),
      userId,
      taxonKey,
      commonName: best.commonName,
      scientificName: collectionScientificName(best),
      rarity: best.rarity ?? "R",
      coverObservationId: cover.id,
      firstCollectedAt: now,
      updatedAt: now,
    });
    return;
  }

  await db
    .update(collectionEntries)
    .set({
      commonName: best.commonName ?? existing.commonName,
      scientificName: collectionScientificName(best) ?? existing.scientificName,
      rarity: best.rarity ?? existing.rarity,
      coverObservationId: cover.id,
      updatedAt: now,
    })
    .where(eq(collectionEntries.id, existing.id));
}

export async function reclaimSharedProgressForUserTrip(userId: string, tripId: string) {
  const credits = await db.query.sharedCollectionCredits.findMany({
    where: and(
      eq(sharedCollectionCredits.userId, userId),
      eq(sharedCollectionCredits.tripId, tripId),
    ),
  });
  const taxons = [...new Set(credits.map((c) => c.taxonKey))];
  await db
    .delete(sharedCollectionCredits)
    .where(
      and(eq(sharedCollectionCredits.userId, userId), eq(sharedCollectionCredits.tripId, tripId)),
    );

  for (const taxon of taxons) {
    await rebuildCollectionTaxonForUser(userId, taxon);
    await rebuildPetTaxonForUser(userId, taxon);
  }

}

export async function revokeCreditsForObservation(observationId: string) {
  const credits = await db.query.sharedCollectionCredits.findMany({
    where: eq(sharedCollectionCredits.observationId, observationId),
  });
  await db
    .delete(sharedCollectionCredits)
    .where(eq(sharedCollectionCredits.observationId, observationId));

  const byUser = new Map<string, Set<string>>();
  for (const c of credits) {
    const set = byUser.get(c.userId) ?? new Set();
    set.add(c.taxonKey);
    byUser.set(c.userId, set);
  }
  for (const [uid, taxons] of byUser) {
    for (const taxon of taxons) {
      await rebuildCollectionTaxonForUser(uid, taxon);
      await rebuildPetTaxonForUser(uid, taxon);
    }
  }

}
