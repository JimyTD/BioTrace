import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { t } from "@biotrace/messages";
import { requireUser, type Variables } from "../auth.js";
import { db } from "../db/index.js";
import { observations, trips } from "../db/schema.js";
import { apiError } from "../errors.js";
import { enqueueIdentify } from "../jobs/identify.js";
import { readExif, saveDisplayImage } from "../services/media.js";
import { repairCollectionAfterObservationDeleted } from "../services/collection.js";
import { removeObservationFiles } from "../services/observationFiles.js";
import { serializeObservation, serializeTrip } from "../serialize.js";

export const tripRoutes = new Hono<{ Variables: Variables }>();

tripRoutes.use("*", requireUser);

tripRoutes.get("/", async (c) => {
  const user = c.get("user");
  const rows = await db.query.trips.findMany({
    where: eq(trips.userId, user.id),
    orderBy: [desc(trips.createdAt)],
  });
  return c.json({ trips: rows.map(serializeTrip) });
});

tripRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = z.object({ title: z.string().trim().min(1).max(120) }).parse(await c.req.json());
  const trip = {
    id: crypto.randomUUID(),
    userId: user.id,
    title: body.title,
    createdAt: new Date(),
  };
  await db.insert(trips).values(trip);
  return c.json({ trip: serializeTrip(trip) }, 201);
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
  return c.json({ trip: serializeTrip(trip) });
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
  const body = z.object({ title: z.string().trim().min(1).max(120) }).parse(await c.req.json());
  await db.update(trips).set({ title: body.title }).where(eq(trips.id, trip.id));
  return c.json({ trip: serializeTrip({ ...trip, title: body.title }) });
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
  const exif = await readExif(buffer);
  const observationId = crypto.randomUUID();
  const now = new Date();

  const saved = await saveDisplayImage({
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
    displayPath: saved.relativePath,
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
    locationPrecise: null,
    alertIntroduced: false,
    taxonKey: null,
    identifyProvider: null,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(observations).values(row);

  enqueueIdentify({
    observationId,
    imagePath: saved.absolutePath,
    mimeType: saved.mimeType,
    lat: exif.lat,
    lng: exif.lng,
    capturedAt: exif.capturedAt,
    description,
  });

  return c.json({ observation: serializeObservation(row, { redactPending: true }) }, 201);
});
