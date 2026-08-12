import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, genInviteCode } from "../db/index.js";
import {
  observations,
  sharedCollectionCredits,
  tripMembers,
  trips,
  users,
  type Trip,
} from "../db/schema.js";
import { repairCollectionAfterObservationDeleted } from "./collection.js";
import { removeObservationFiles } from "./observationFiles.js";
import {
  grantSharedProgressForObservation,
  reclaimSharedProgressForUserTrip,
  revokeCreditsForObservation,
} from "./shared-progress.js";

export const TRIP_MEMBER_LIMIT = 10;

export async function ensureInviteCode(tripId: string): Promise<string> {
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  if (!trip) throw new Error("trip_not_found");
  if (trip.inviteCode?.trim()) return trip.inviteCode.trim();
  for (let i = 0; i < 10; i++) {
    const code = genInviteCode();
    try {
      await db
        .update(trips)
        .set({ inviteCode: code, allowJoin: trip.allowJoin ?? false })
        .where(eq(trips.id, tripId));
      return code;
    } catch {
      /* unique collision */
    }
  }
  throw new Error("invite_code_alloc_failed");
}

export async function addTripMember(tripId: string, userId: string, joinedAt = new Date()) {
  await db.insert(tripMembers).values({ tripId, userId, joinedAt }).onConflictDoNothing();
}

export async function isTripMember(tripId: string, userId: string): Promise<boolean> {
  const row = await db.query.tripMembers.findFirst({
    where: and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)),
    columns: { userId: true },
  });
  return Boolean(row);
}

export async function requireTripMember(tripId: string, userId: string): Promise<Trip> {
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  if (!trip || !(await isTripMember(tripId, userId))) {
    throw new Error("trip_not_found");
  }
  return trip;
}

export async function requireTripAdmin(tripId: string, userId: string): Promise<Trip> {
  const trip = await requireTripMember(tripId, userId);
  if (trip.userId !== userId) throw new Error("not_trip_admin");
  return trip;
}

export async function listTripMemberIds(tripId: string): Promise<string[]> {
  const rows = await db.query.tripMembers.findMany({
    where: eq(tripMembers.tripId, tripId),
    columns: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function listTripMembersDetailed(tripId: string) {
  return db
    .select({
      userId: tripMembers.userId,
      joinedAt: tripMembers.joinedAt,
      displayName: users.displayName,
      email: users.email,
    })
    .from(tripMembers)
    .innerJoin(users, eq(users.id, tripMembers.userId))
    .where(eq(tripMembers.tripId, tripId))
    .orderBy(asc(tripMembers.joinedAt));
}

export async function countTripMembers(tripId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  return rows[0]?.n ?? 0;
}

export async function listTripsForUser(userId: string): Promise<Trip[]> {
  const memberships = await db.query.tripMembers.findMany({
    where: eq(tripMembers.userId, userId),
    columns: { tripId: true },
  });
  if (memberships.length === 0) return [];
  return db.query.trips.findMany({
    where: inArray(
      trips.id,
      memberships.map((m) => m.tripId),
    ),
    orderBy: [desc(trips.createdAt)],
  });
}

export async function joinTripByInviteCode(userId: string, rawCode: string): Promise<Trip> {
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error("invite_invalid");
  const trip = await db.query.trips.findFirst({
    where: eq(trips.inviteCode, code),
  });
  if (!trip) throw new Error("invite_invalid");
  if (!trip.allowJoin) throw new Error("invite_closed");
  if (await isTripMember(trip.id, userId)) return trip;

  const n = await countTripMembers(trip.id);
  if (n >= TRIP_MEMBER_LIMIT) throw new Error("trip_full");

  await addTripMember(trip.id, userId);
  const settled = await db.query.observations.findMany({
    where: and(eq(observations.tripId, trip.id), eq(observations.status, "settled")),
  });
  for (const obs of settled) {
    await grantSharedProgressForObservation(obs, [userId]);
  }
  return trip;
}

export async function setAllowJoin(tripId: string, adminId: string, allowJoin: boolean) {
  await requireTripAdmin(tripId, adminId);
  await ensureInviteCode(tripId);
  await db.update(trips).set({ allowJoin }).where(eq(trips.id, tripId));
}

async function splitOwnObservationsToPrivateTrip(
  fromTripId: string,
  userId: string,
  title: string,
) {
  const mine = await db.query.observations.findMany({
    where: and(eq(observations.tripId, fromTripId), eq(observations.userId, userId)),
    columns: { id: true },
  });
  if (mine.length === 0) return;

  const privateTrip = {
    id: crypto.randomUUID(),
    userId,
    title,
    createdAt: new Date(),
    metaManualEnabled: false,
    manualDateText: null as string | null,
    manualPlaceText: null as string | null,
    inviteCode: genInviteCode(),
    allowJoin: false,
  };
  await db.insert(trips).values(privateTrip);
  await addTripMember(privateTrip.id, userId);
  await db
    .update(observations)
    .set({ tripId: privateTrip.id })
    .where(and(eq(observations.tripId, fromTripId), eq(observations.userId, userId)));
}

export async function leaveTrip(tripId: string, userId: string): Promise<"left" | "dissolved"> {
  const trip = await requireTripMember(tripId, userId);
  const members = await listTripMemberIds(tripId);

  if (members.length <= 1) {
    await dissolveTripAsAdmin(tripId, userId);
    return "dissolved";
  }

  if (trip.userId === userId) {
    const next = await db.query.tripMembers.findFirst({
      where: and(eq(tripMembers.tripId, tripId), ne(tripMembers.userId, userId)),
      orderBy: [asc(tripMembers.joinedAt)],
    });
    if (!next) {
      await dissolveTripAsAdmin(tripId, userId);
      return "dissolved";
    }
    await db.update(trips).set({ userId: next.userId }).where(eq(trips.id, tripId));
  }

  await reclaimSharedProgressForUserTrip(userId, tripId);
  await splitOwnObservationsToPrivateTrip(tripId, userId, trip.title);
  await db
    .delete(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
  return "left";
}

export async function kickMember(tripId: string, adminId: string, targetUserId: string) {
  await requireTripAdmin(tripId, adminId);
  if (targetUserId === adminId) throw new Error("cannot_kick_self");
  if (!(await isTripMember(tripId, targetUserId))) throw new Error("not_member");
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  await reclaimSharedProgressForUserTrip(targetUserId, tripId);
  if (trip) {
    await splitOwnObservationsToPrivateTrip(tripId, targetUserId, trip.title);
  }
  await db
    .delete(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, targetUserId)));
}

export async function dissolveTripAsAdmin(tripId: string, adminId: string) {
  const trip = await requireTripAdmin(tripId, adminId);
  const memberIds = await listTripMemberIds(tripId);

  for (const uid of memberIds) {
    await reclaimSharedProgressForUserTrip(uid, tripId);
    await splitOwnObservationsToPrivateTrip(tripId, uid, trip.title);
  }

  await db.delete(sharedCollectionCredits).where(eq(sharedCollectionCredits.tripId, tripId));
  await db.delete(tripMembers).where(eq(tripMembers.tripId, tripId));

  const leftover = await db.query.observations.findMany({
    where: eq(observations.tripId, tripId),
  });
  for (const row of leftover) {
    await revokeCreditsForObservation(row.id);
    await removeObservationFiles(row.displayPath);
    await repairCollectionAfterObservationDeleted(row.userId, row.id, row.taxonKey);
  }
  await db.delete(observations).where(eq(observations.tripId, tripId));
  await db.delete(trips).where(eq(trips.id, tripId));
}
