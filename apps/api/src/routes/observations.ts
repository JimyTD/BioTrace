import { join } from "node:path";
import { Hono } from "hono";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { t } from "@biotrace/messages";
import { requireUser, type Variables } from "../auth.js";
import { db } from "../db/index.js";
import { observations } from "../db/schema.js";
import { apiError } from "../errors.js";
import { env } from "../env.js";
import { enqueueIdentify } from "../jobs/identify.js";
import {
  repairCollectionAfterObservationDeleted,
  upsertCollectionFromObservation,
} from "../services/collection.js";
import { removeObservationFiles } from "../services/observationFiles.js";
import { serializeObservation } from "../serialize.js";
import { evaluateVolumesOnObservation } from "../volumes/index.js";

export const observationRoutes = new Hono<{ Variables: Variables }>();

observationRoutes.use("*", requireUser);

observationRoutes.get("/", async (c) => {
  const user = c.get("user");
  const mappedOnly = c.req.query("mapped") === "1";
  const rows = await db.query.observations.findMany({
    where: mappedOnly
      ? and(eq(observations.userId, user.id), isNotNull(observations.lat), isNotNull(observations.lng))
      : eq(observations.userId, user.id),
    orderBy: [desc(observations.createdAt)],
  });
  return c.json({
    observations: rows.map((r) => serializeObservation(r, { redactPending: true })),
  });
});

observationRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const row = await db.query.observations.findFirst({
    where: and(eq(observations.id, c.req.param("id")), eq(observations.userId, user.id)),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  const forSettle = c.req.query("forSettle") === "1";
  const redactPending = !(forSettle && row.status === "pending_settle");
  return c.json({
    observation: serializeObservation(row, { redactPending }),
  });
});

observationRoutes.post("/:id/settle", async (c) => {
  const user = c.get("user");
  const row = await db.query.observations.findFirst({
    where: and(eq(observations.id, c.req.param("id")), eq(observations.userId, user.id)),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  if (row.status !== "pending_settle") {
    return c.json({ error: t("settle.notPending"), code: "not_pending" }, 400);
  }

  const now = new Date();
  await db
    .update(observations)
    .set({
      status: "settled",
      settledAt: now,
      updatedAt: now,
    })
    .where(eq(observations.id, row.id));

  const updated = await db.query.observations.findFirst({
    where: eq(observations.id, row.id),
  });
  let volumeEval = { newlyLit: [] as Array<{ volumeId: string; slotId: string }>, newlyCompletedVolumeIds: [] as string[] };
  if (updated) {
    await upsertCollectionFromObservation(updated);
    volumeEval = await evaluateVolumesOnObservation(updated);
  }

  return c.json({
    observation: serializeObservation(updated!, { redactPending: false }),
    volumes: volumeEval,
  });
});

observationRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const row = await db.query.observations.findFirst({
    where: and(eq(observations.id, c.req.param("id")), eq(observations.userId, user.id)),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }

  await db.delete(observations).where(eq(observations.id, row.id));
  await removeObservationFiles(row.displayPath);
  await repairCollectionAfterObservationDeleted(user.id, row.id, row.taxonKey);

  return c.json({ ok: true, id: row.id });
});

observationRoutes.post("/:id/reidentify", async (c) => {
  const user = c.get("user");
  const row = await db.query.observations.findFirst({
    where: and(eq(observations.id, c.req.param("id")), eq(observations.userId, user.id)),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }

  const body = z
    .object({
      description: z.string().trim().min(1).max(2000),
    })
    .parse(await c.req.json());

  // Drop this observation from collection under the old taxon before rewriting identity
  await repairCollectionAfterObservationDeleted(user.id, row.id, row.taxonKey);

  const now = new Date();
  await db
    .update(observations)
    .set({
      status: "analyzing",
      description: body.description,
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
      updatedAt: now,
    })
    .where(eq(observations.id, row.id));

  const absolutePath = join(env.uploadDir, row.displayPath);
  enqueueIdentify({
    observationId: row.id,
    imagePath: absolutePath,
    mimeType: "image/jpeg",
    lat: row.lat,
    lng: row.lng,
    capturedAt: row.capturedAt,
    description: body.description,
  });

  const updated = await db.query.observations.findFirst({
    where: eq(observations.id, row.id),
  });
  return c.json({ observation: serializeObservation(updated!, { redactPending: true }) });
});
