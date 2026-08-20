import { and, desc, eq, inArray, ne } from "drizzle-orm";
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
import {
  evaluateVolumesForUser,
  type VolumeEvalResult,
} from "../volumes/evaluate.js";
import { loadVolumeConfigs } from "../volumes/load.js";
import { readVolumeProgress, writeVolumeProgress } from "../volumes/progress.js";

const emptyVolumeEval = (): VolumeEvalResult => ({
  newlyLit: [],
  newlyCompletedVolumeIds: [],
  newlyCompleted: [],
});

async function memberIdsOfTrip(tripId: string): Promise<string[]> {
  const rows = await db.query.tripMembers.findMany({
    where: eq(tripMembers.tripId, tripId),
    columns: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function upsertCollectionForUser(userId: string, obs: Observation) {
  if (!obs.taxonKey || !obs.rarity || obs.status !== "settled") return;

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
 * Grant图鉴 + 套册 to specific users (join backfill) or all current members (settle).
 * If `focusUserId` is set, evaluate that user first and return their volume delta
 * (for settle ceremony UI); other members are still granted afterward.
 */
export async function grantSharedProgressForObservation(
  obs: Observation,
  onlyUserIds?: string[],
  focusUserId?: string,
): Promise<VolumeEvalResult> {
  if (obs.status !== "settled" || !obs.taxonKey) return emptyVolumeEval();

  const memberIds = onlyUserIds ?? (await memberIdsOfTrip(obs.tripId));
  for (const uid of memberIds) {
    await upsertCollectionForUser(uid, obs);
    if (uid !== obs.userId) {
      await recordCredit(uid, obs);
    }
  }

  let focusEval = emptyVolumeEval();
  const ordered = focusUserId
    ? [focusUserId, ...memberIds.filter((id) => id !== focusUserId)]
    : memberIds;
  const seen = new Set<string>();
  for (const uid of ordered) {
    if (seen.has(uid) || !memberIds.includes(uid)) continue;
    seen.add(uid);
    const ev = await evaluateVolumesForUser(uid, obs);
    if (focusUserId && uid === focusUserId) focusEval = ev;
  }
  return focusEval;
}

export async function grantSharedProgressToAllMembers(
  obs: Observation,
  focusUserId?: string,
): Promise<VolumeEvalResult> {
  return grantSharedProgressForObservation(obs, undefined, focusUserId);
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

  const sources = [...own, ...credited];
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
  const ownBest = own.sort(
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
  }

  // Unlit slots lit only by *others'* photos on this trip (own uploads stay).
  const othersObs = await db.query.observations.findMany({
    where: and(eq(observations.tripId, tripId), ne(observations.userId, userId)),
    columns: { id: true },
  });
  const othersObsIds = new Set(othersObs.map((o) => o.id));
  if (othersObsIds.size === 0 && taxons.length === 0) return;

  const volumes = loadVolumeConfigs();
  for (const vol of volumes) {
    const prev = await readVolumeProgress(userId, vol.id);
    let changed = false;
    const litSlots = { ...prev.litSlots };
    for (const [slotId, entry] of Object.entries(litSlots)) {
      if (entry.observationId && othersObsIds.has(entry.observationId)) {
        delete litSlots[slotId];
        changed = true;
      }
    }
    if (!changed) continue;
    const complete = vol.slots.every((s) => Boolean(litSlots[s.id]));
    await writeVolumeProgress({
      userId,
      volumeId: vol.id,
      litSlots,
      completedAt: complete ? prev.completedAt ?? new Date() : null,
    });
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
    }
  }

  // Unlit volume slots pointing at this observation for any user who had credit / uploader
  const volumes = loadVolumeConfigs();
  const userIds = new Set<string>([...byUser.keys()]);
  const obs = await db.query.observations.findFirst({
    where: eq(observations.id, observationId),
    columns: { userId: true },
  });
  if (obs) userIds.add(obs.userId);

  for (const uid of userIds) {
    for (const vol of volumes) {
      const prev = await readVolumeProgress(uid, vol.id);
      let changed = false;
      const litSlots = { ...prev.litSlots };
      for (const [slotId, entry] of Object.entries(litSlots)) {
        if (entry.observationId === observationId) {
          delete litSlots[slotId];
          changed = true;
        }
      }
      if (!changed) continue;
      const complete = vol.slots.every((s) => Boolean(litSlots[s.id]));
      await writeVolumeProgress({
        userId: uid,
        volumeId: vol.id,
        litSlots,
        completedAt: complete ? prev.completedAt ?? new Date() : null,
      });
    }
  }
}
