import { createHash } from "node:crypto";
import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { t } from "@biotrace/messages";
import { requireUser, type Variables } from "../auth.js";
import { db } from "../db/index.js";
import { observations, trips } from "../db/schema.js";
import { apiError } from "../errors.js";
import { env } from "../env.js";
import { enqueueIdentify } from "../jobs/identify.js";
import { readExif, saveObservationMedia } from "../services/media.js";
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
import type { Trip } from "../db/schema.js";

export const tripRoutes = new Hono<{ Variables: Variables }>();

tripRoutes.use("*", requireUser);

async function loadTripObsSummary(userId: string, tripIds: string[]) {
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
    .where(and(eq(observations.userId, userId), inArray(observations.tripId, tripIds)))
    .groupBy(observations.tripId);
  const countByTrip = new Map(countRows.map((r) => [r.tripId, r.count]));

  const coverByTrip = new Map<string, string>();
  const obsByTrip = new Map<string, TripObsForSummary[]>();
  const obsRows = await db.query.observations.findMany({
    where: and(eq(observations.userId, userId), inArray(observations.tripId, tripIds)),
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

function tripWithSummary(
  trip: Trip,
  pack: {
    countByTrip: Map<string, number>;
    coverByTrip: Map<string, string>;
    obsByTrip: Map<string, TripObsForSummary[]>;
  },
) {
  const obsList = pack.obsByTrip.get(trip.id) ?? [];
  return serializeTrip(trip, {
    coverDisplayUrl: pack.coverByTrip.get(trip.id) ?? null,
    observationCount: pack.countByTrip.get(trip.id) ?? obsList.length,
    summary: resolveTripSummary(obsList, trip),
  });
}

tripRoutes.get("/", async (c) => {
  const user = c.get("user");
  const rows = await db.query.trips.findMany({
    where: eq(trips.userId, user.id),
    orderBy: [desc(trips.createdAt)],
  });
  if (rows.length === 0) {
    return c.json({ trips: [] });
  }

  const pack = await loadTripObsSummary(
    user.id,
    rows.map((r) => r.id),
  );

  return c.json({
    trips: rows.map((trip) => tripWithSummary(trip, pack)),
  });
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
  };
  await db.insert(trips).values(trip);
  return c.json(
    {
      trip: serializeTrip(trip, {
        summary: resolveTripSummary([], trip),
      }),
    },
    201,
  );
});

tripRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, c.req.param("id")), eq(trips.userId, user.id)),
  });
  if (!trip) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  const pack = await loadTripObsSummary(user.id, [trip.id]);
  return c.json({ trip: tripWithSummary(trip, pack) });
});

tripRoutes.patch("/:id", async (c) => {
  const user = c.get("user");
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, c.req.param("id")), eq(trips.userId, user.id)),
  });
  if (!trip) {
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
    const pack = await loadTripObsSummary(user.id, [trip.id]);
    return c.json({ trip: tripWithSummary(trip, pack) });
  }

  await db.update(trips).set(patch).where(eq(trips.id, trip.id));
  const updated = { ...trip, ...patch };
  const pack = await loadTripObsSummary(user.id, [trip.id]);
  return c.json({ trip: tripWithSummary(updated, pack) });
});

tripRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, c.req.param("id")), eq(trips.userId, user.id)),
  });
  if (!trip) {
    const err = apiError("not found", 404);
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

  const rows = await db.query.observations.findMany({
    where: and(eq(observations.tripId, trip.id), eq(observations.userId, user.id)),
  });
  for (const row of rows) {
    await removeObservationFiles(row.displayPath);
    await repairCollectionAfterObservationDeleted(user.id, row.id, row.taxonKey);
  }
  await db.delete(observations).where(eq(observations.tripId, trip.id));
  await db.delete(trips).where(eq(trips.id, trip.id));

  return c.json({ ok: true, id: trip.id, deletedObservations: rows.length });
});

tripRoutes.get("/:id/observations", async (c) => {
  const user = c.get("user");
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, c.req.param("id")), eq(trips.userId, user.id)),
  });
  if (!trip) {
    const err = apiError("trip not found", 404);
    return c.json(err.body, err.status);
  }
  const rows = await db.query.observations.findMany({
    where: and(eq(observations.tripId, trip.id), eq(observations.userId, user.id)),
    orderBy: [desc(observations.createdAt)],
  });
  return c.json({
    observations: rows.map((r) => serializeObservation(r, { redactPending: true })),
  });
});

tripRoutes.post("/:id/observations", async (c) => {
  const user = c.get("user");
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, c.req.param("id")), eq(trips.userId, user.id)),
  });
  if (!trip) {
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

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > env.uploadMaxBytes) {
    return c.json(
      {
        error: t("album.fileTooLarge", { maxMb: Math.round(env.uploadMaxBytes / (1024 * 1024)) }),
        code: "file_too_large",
      },
      400,
    );
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const dup = await db.query.observations.findFirst({
    where: and(eq(observations.userId, user.id), eq(observations.contentHash, contentHash)),
    columns: { id: true },
  });
  if (dup) {
    return c.json({ error: t("album.duplicatePhoto"), code: "duplicate_photo" }, 409);
  }

  const exif = await readExif(buffer);
  const observationId = crypto.randomUUID();
  const now = new Date();

  const saved = await saveObservationMedia({
    observationId,
    buffer,
    mimeType: file.type || "image/jpeg",
    originalName: file.name || "photo.jpg",
  });

  const row = {
    id: observationId,
    tripId: trip.id,
    userId: user.id,
    status: "analyzing" as const,
    description,
    capturedAt: exif.capturedAt,
    lat: exif.lat,
    lng: exif.lng,
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
    error: null,
    settleTier: null,
    rarity: null,
    countryCode: null,
    // null = 尚未做过国别判定（此刻刚上传，鉴定还没跑）
    countrySource: null,
    locationPrecise: null,
    alertIntroduced: false,
    taxonKey: null,
    identifyProvider: null,
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

  enqueueIdentify({
    observationId,
    imagePath: saved.displayAbsolutePath,
    mimeType: saved.mimeType,
    lat: exif.lat,
    lng: exif.lng,
    capturedAt: exif.capturedAt,
    description,
  });

  return c.json({ observation: serializeObservation(row, { redactPending: true }) }, 201);
});
