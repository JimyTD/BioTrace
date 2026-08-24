import { createHash } from "node:crypto";
import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { t } from "@biotrace/messages";
import { requireUser, type Variables } from "../auth.js";
import { db, genInviteCode } from "../db/index.js";
import { observations, tripMembers, trips, type Trip } from "../db/schema.js";
import { apiError } from "../errors.js";
import { env } from "../env.js";
import { enqueueIdentify } from "../jobs/identify.js";
import { isPlatformIdentifyQuotaExhausted } from "../services/identify-quota.js";
import { usesOwnIdentifyKey } from "../services/user-identify.js";
import { embedFallbackExif, readExif, saveObservationMedia } from "../services/media.js";
import { validCoords } from "../settle/geo/coords.js";
import { repairCollectionAfterObservationDeleted } from "../services/collection.js";
import { removeObservationFiles } from "../services/observationFiles.js";
import {
  observationDisplayUrl,
  serializeObservation,
  serializeTrip,
} from "../serialize.js";
import {
  resolveTripSummary,
  type TripObsForSummary,
} from "../trips/summary.js";
import {
  addTripMember,
  countTripMembers,
  dissolveTripAsAdmin,
  ensureInviteCode,
  joinTripByInviteCode,
  kickMember,
  leaveTrip,
  listTripMembersDetailed,
  listTripsForUser,
  requireTripAdmin,
  requireTripMember,
  setAllowJoin,
  TRIP_MEMBER_LIMIT,
} from "../services/trip-share.js";

export const tripRoutes = new Hono<{ Variables: Variables }>();

tripRoutes.use("*", requireUser);

function parseFormNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseFormDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadTripObsSummary(tripIds: string[]) {
  if (tripIds.length === 0) {
    return {
      countByTrip: new Map<string, number>(),
      coverByTrip: new Map<string, string>(),
      obsByTrip: new Map<string, TripObsForSummary[]>(),
    };
  }

  const countRows = await db
    .select({
      tripId: observations.tripId,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(observations)
    .where(inArray(observations.tripId, tripIds))
    .groupBy(observations.tripId);
  const countByTrip = new Map(countRows.map((r) => [r.tripId, r.count]));

  const coverByTrip = new Map<string, string>();
  const obsByTrip = new Map<string, TripObsForSummary[]>();
  const obsRows = await db.query.observations.findMany({
    where: inArray(observations.tripId, tripIds),
    orderBy: [desc(observations.createdAt)],
    columns: {
      tripId: true,
      displayPath: true,
      capturedAt: true,
      createdAt: true,
      locationLabel: true,
      countryCode: true,
    },
  });
  for (const obs of obsRows) {
    if (!coverByTrip.has(obs.tripId)) {
      coverByTrip.set(obs.tripId, observationDisplayUrl(obs.displayPath));
    }
    const list = obsByTrip.get(obs.tripId) ?? [];
    list.push({
      capturedAt: obs.capturedAt,
      createdAt: obs.createdAt,
      locationLabel: obs.locationLabel,
      countryCode: obs.countryCode,
    });
    obsByTrip.set(obs.tripId, list);
  }

  return { countByTrip, coverByTrip, obsByTrip };
}

async function tripWithSummary(trip: Trip, userId: string, pack: Awaited<ReturnType<typeof loadTripObsSummary>>) {
  const obsList = pack.obsByTrip.get(trip.id) ?? [];
  const memberCount = await countTripMembers(trip.id);
  const isAdmin = trip.userId === userId;
  let inviteCode: string | null = null;
  if (isAdmin) {
    inviteCode = trip.inviteCode?.trim() || (await ensureInviteCode(trip.id));
  }
  return serializeTrip(trip, {
    coverDisplayUrl: pack.coverByTrip.get(trip.id) ?? null,
    observationCount: pack.countByTrip.get(trip.id) ?? obsList.length,
    summary: resolveTripSummary(obsList, trip),
    memberCount,
    isAdmin,
    inviteCode,
    allowJoin: Boolean(trip.allowJoin),
  });
}

function shareError(code: string) {
  const map: Record<string, { key: Parameters<typeof t>[0]; status: 400 | 403 | 404 | 409 }> = {
    trip_not_found: { key: "error.tripNotFound", status: 404 },
    not_trip_admin: { key: "share.notAdmin", status: 403 },
    invite_invalid: { key: "share.inviteInvalid", status: 404 },
    invite_closed: { key: "share.inviteClosed", status: 403 },
    trip_full: { key: "share.tripFull", status: 409 },
    cannot_kick_self: { key: "share.cannotKickSelf", status: 400 },
    not_member: { key: "share.notMember", status: 404 },
  };
  const hit = map[code] ?? { key: "error.server" as const, status: 400 as const };
  return { body: { error: t(hit.key), code }, status: hit.status };
}

tripRoutes.get("/", async (c) => {
  const user = c.get("user");
  const rows = await listTripsForUser(user.id);
  if (rows.length === 0) {
    return c.json({ trips: [] });
  }

  const pack = await loadTripObsSummary(rows.map((r) => r.id));
  const tripsOut = [];
  for (const trip of rows) {
    tripsOut.push(await tripWithSummary(trip, user.id, pack));
  }
  return c.json({ trips: tripsOut });
});

tripRoutes.post("/join", async (c) => {
  const user = c.get("user");
  const body = z.object({ code: z.string().trim().min(4).max(32) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: t("share.inviteInvalid"), code: "invite_invalid" }, 400);
  }
  try {
    const trip = await joinTripByInviteCode(user.id, body.data.code);
    const pack = await loadTripObsSummary([trip.id]);
    return c.json({ trip: await tripWithSummary(trip, user.id, pack) });
  } catch (e) {
    const code = e instanceof Error ? e.message : "invite_invalid";
    const err = shareError(code);
    return c.json(err.body, err.status);
  }
});

tripRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = z.object({ title: z.string().trim().min(1).max(120) }).parse(await c.req.json());
  const trip = {
    id: crypto.randomUUID(),
    userId: user.id,
    title: body.title,
    createdAt: new Date(),
    metaManualEnabled: false,
    manualDateText: null as string | null,
    manualPlaceText: null as string | null,
    inviteCode: genInviteCode(),
    allowJoin: false,
  };
  await db.insert(trips).values(trip);
  await addTripMember(trip.id, user.id);
  return c.json(
    {
      trip: serializeTrip(trip, {
        summary: resolveTripSummary([], trip),
        memberCount: 1,
        isAdmin: true,
        inviteCode: trip.inviteCode,
        allowJoin: false,
      }),
    },
    201,
  );
});

tripRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  let trip: Trip;
  try {
    trip = await requireTripMember(c.req.param("id"), user.id);
  } catch {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  const pack = await loadTripObsSummary([trip.id]);
  return c.json({ trip: await tripWithSummary(trip, user.id, pack) });
});

tripRoutes.patch("/:id", async (c) => {
  const user = c.get("user");
  let trip: Trip;
  try {
    trip = await requireTripMember(c.req.param("id"), user.id);
  } catch {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  const body = z
    .object({
      title: z.string().trim().min(1).max(120).optional(),
      metaManualEnabled: z.boolean().optional(),
      manualDateText: z.union([z.string().max(80), z.null()]).optional(),
      manualPlaceText: z.union([z.string().max(120), z.null()]).optional(),
    })
    .parse(await c.req.json());

  const patch: Partial<Trip> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.metaManualEnabled !== undefined) patch.metaManualEnabled = body.metaManualEnabled;
  if (body.manualDateText !== undefined) {
    const v = body.manualDateText?.trim() ?? "";
    patch.manualDateText = v || null;
  }
  if (body.manualPlaceText !== undefined) {
    const v = body.manualPlaceText?.trim() ?? "";
    patch.manualPlaceText = v || null;
  }
  if (Object.keys(patch).length === 0) {
    const pack = await loadTripObsSummary([trip.id]);
    return c.json({ trip: await tripWithSummary(trip, user.id, pack) });
  }

  await db.update(trips).set(patch).where(eq(trips.id, trip.id));
  const updated = { ...trip, ...patch };
  const pack = await loadTripObsSummary([trip.id]);
  return c.json({ trip: await tripWithSummary(updated, user.id, pack) });
});

tripRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  let trip: Trip;
  try {
    trip = await requireTripAdmin(c.req.param("id"), user.id);
  } catch (e) {
    const code = e instanceof Error ? e.message : "trip_not_found";
    const err = shareError(code);
    return c.json(err.body, err.status);
  }

  const body = z
    .object({ confirmPhrase: z.string() })
    .parse(await c.req.json().catch(() => ({})));
  const expected = t("trips.deleteConfirmPhrase");
  if (body.confirmPhrase.trim() !== expected) {
    const err = apiError("confirm phrase mismatch", 400);
    return c.json(err.body, err.status);
  }

  const memberCount = await countTripMembers(trip.id);
  if (memberCount > 1) {
    await dissolveTripAsAdmin(trip.id, user.id);
    return c.json({ ok: true, id: trip.id, deletedObservations: 0, dissolved: true });
  }

  const rows = await db.query.observations.findMany({
    where: and(eq(observations.tripId, trip.id), eq(observations.userId, user.id)),
  });
  for (const row of rows) {
    await removeObservationFiles(row.displayPath);
    await repairCollectionAfterObservationDeleted(user.id, row.id, row.taxonKey);
  }
  await db.delete(observations).where(eq(observations.tripId, trip.id));
  await db.delete(tripMembers).where(eq(tripMembers.tripId, trip.id));
  await db.delete(trips).where(eq(trips.id, trip.id));

  return c.json({ ok: true, id: trip.id, deletedObservations: rows.length });
});

tripRoutes.get("/:id/members", async (c) => {
  const user = c.get("user");
  try {
    await requireTripMember(c.req.param("id"), user.id);
  } catch {
    return c.json({ error: t("error.tripNotFound"), code: "trip_not_found" }, 404);
  }
  const members = await listTripMembersDetailed(c.req.param("id"));
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, c.req.param("id")) });
  return c.json({
    members: members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      email: m.email,
      joinedAt: m.joinedAt.toISOString(),
      isAdmin: trip?.userId === m.userId,
    })),
    memberLimit: TRIP_MEMBER_LIMIT,
  });
});

tripRoutes.patch("/:id/share", async (c) => {
  const user = c.get("user");
  const body = z
    .object({ allowJoin: z.boolean() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: t("share.invalidShare"), code: "invalid_share" }, 400);
  }
  try {
    await setAllowJoin(c.req.param("id"), user.id, body.data.allowJoin);
    const code = await ensureInviteCode(c.req.param("id"));
    const trip = await db.query.trips.findFirst({ where: eq(trips.id, c.req.param("id")) });
    return c.json({
      allowJoin: Boolean(trip?.allowJoin),
      inviteCode: code,
      memberLimit: TRIP_MEMBER_LIMIT,
    });
  } catch (e) {
    const err = shareError(e instanceof Error ? e.message : "not_trip_admin");
    return c.json(err.body, err.status);
  }
});

tripRoutes.post("/:id/leave", async (c) => {
  const user = c.get("user");
  try {
    const result = await leaveTrip(c.req.param("id"), user.id);
    return c.json({ ok: true, result });
  } catch (e) {
    const err = shareError(e instanceof Error ? e.message : "trip_not_found");
    return c.json(err.body, err.status);
  }
});

tripRoutes.post("/:id/kick", async (c) => {
  const user = c.get("user");
  const body = z
    .object({ userId: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: t("share.notMember"), code: "not_member" }, 400);
  }
  try {
    await kickMember(c.req.param("id"), user.id, body.data.userId);
    return c.json({ ok: true });
  } catch (e) {
    const err = shareError(e instanceof Error ? e.message : "not_trip_admin");
    return c.json(err.body, err.status);
  }
});

tripRoutes.get("/:id/observations", async (c) => {
  const user = c.get("user");
  let trip: Trip;
  try {
    trip = await requireTripMember(c.req.param("id"), user.id);
  } catch {
    const err = apiError("trip not found", 404);
    return c.json(err.body, err.status);
  }
  const rows = await db.query.observations.findMany({
    where: eq(observations.tripId, trip.id),
    orderBy: [desc(observations.createdAt)],
  });
  return c.json({
    observations: rows.map((r) => serializeObservation(r, { redactPending: true })),
  });
});

tripRoutes.post("/:id/observations", async (c) => {
  const user = c.get("user");
  let trip: Trip;
  try {
    trip = await requireTripMember(c.req.param("id"), user.id);
  } catch {
    const err = apiError("trip not found", 404);
    return c.json(err.body, err.status);
  }

  const body = await c.req.parseBody({ all: true });
  const file = body.file;
  if (!file || !(file instanceof File)) {
    const err = apiError("file is required", 400);
    return c.json(err.body, err.status);
  }
  if (!file.type.startsWith("image/")) {
    const err = apiError("file must be an image", 400);
    return c.json(err.body, err.status);
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const formCoords = validCoords(parseFormNumber(body.lat), parseFormNumber(body.lng));
  const formCapturedAt = parseFormDate(body.capturedAt);

  const incoming = Buffer.from(await file.arrayBuffer());
  if (incoming.byteLength > env.uploadMaxBytes) {
    return c.json(
      {
        error: t("album.fileTooLarge", { maxMb: Math.round(env.uploadMaxBytes / (1024 * 1024)) }),
        code: "file_too_large",
      },
      400,
    );
  }

  const exif = await readExif(incoming);
  const lat = exif.lat ?? formCoords?.lat ?? null;
  const lng = exif.lng ?? formCoords?.lng ?? null;
  const capturedAt = exif.capturedAt ?? formCapturedAt;
  const buffer = embedFallbackExif(incoming, { lat, lng, capturedAt }, exif);

  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const dup = await db.query.observations.findFirst({
    where: and(eq(observations.userId, user.id), eq(observations.contentHash, contentHash)),
    columns: { id: true },
  });
  if (dup) {
    return c.json({ error: t("album.duplicatePhoto"), code: "duplicate_photo" }, 409);
  }

  const observationId = crypto.randomUUID();
  const now = new Date();

  const saved = await saveObservationMedia({
    observationId,
    buffer,
    mimeType: file.type || "image/jpeg",
    originalName: file.name || "photo.jpg",
  });

  const useOwnKey = await usesOwnIdentifyKey(user.id);
  const quotaExhausted =
    !useOwnKey && (await isPlatformIdentifyQuotaExhausted(user.id));
  const row = {
    id: observationId,
    tripId: trip.id,
    userId: user.id,
    status: (quotaExhausted ? "failed" : "analyzing") as "failed" | "analyzing",
    description,
    capturedAt,
    lat,
    lng,
    contentHash,
    displayPath: saved.displayPath,
    originalPath: saved.originalPath,
    locationLabel: null as string | null,
    commonName: null,
    scientificName: null,
    finestReliableRank: null,
    confidence: null,
    taxonomyJson: null,
    blurb: null,
    notes: null,
    error: quotaExhausted ? ("identify_daily_limit" as const) : null,
    settleTier: null,
    rarity: null,
    countryCode: null,
    // null = 尚未做过国别判定（此刻刚上传，鉴定还没跑）
    countrySource: null,
    locationPrecise: null,
    alertIntroduced: false,
    taxonKey: null,
    acceptedTaxonomyJson: null,
    identifyProvider: null,
    identifyModel: null,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.insert(observations).values(row);
  } catch {
    // 并发双传可能撞 UNIQUE；统一成业务错误
    return c.json({ error: t("album.duplicatePhoto"), code: "duplicate_photo" }, 409);
  }

  if (!quotaExhausted) {
    enqueueIdentify({
      observationId,
      imagePath: saved.displayAbsolutePath,
      mimeType: saved.mimeType,
      lat,
      lng,
      capturedAt,
      description,
    });
  }

  return c.json(
    {
      observation: serializeObservation(row, { redactPending: true }),
      ...(quotaExhausted ? { code: "identify_daily_limit" as const } : {}),
    },
    201,
  );
});
