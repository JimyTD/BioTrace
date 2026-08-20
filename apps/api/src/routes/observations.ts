import { join } from "node:path";
import { Hono } from "hono";
import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { z } from "zod";
import { t } from "@biotrace/messages";
import { requireUser, type Variables } from "../auth.js";
import { db } from "../db/index.js";
import { observations, type Observation } from "../db/schema.js";
import { apiError } from "../errors.js";
import { env } from "../env.js";
import { enqueueIdentify } from "../jobs/identify.js";
import { getIdentifyQuota, isPlatformIdentifyQuotaExhausted } from "../services/identify-quota.js";
import { usesOwnIdentifyKey } from "../services/user-identify.js";
import { repairCollectionAfterObservationDeleted } from "../services/collection.js";
import {
  grantSharedProgressToAllMembers,
  revokeCreditsForObservation,
} from "../services/shared-progress.js";
import { isTripMember, listTripsForUser } from "../services/trip-share.js";
import { removeObservationFiles } from "../services/observationFiles.js";
import { serializeObservation } from "../serialize.js";
import { validCoords } from "../settle/geo/coords.js";
import { resolveCountry } from "../settle/country.js";
import { computeSettle } from "../settle/rules.js";
export const observationRoutes = new Hono<{ Variables: Variables }>();

observationRoutes.use("*", requireUser);

async function loadAccessibleObservation(
  obsId: string,
  userId: string,
): Promise<Observation | null> {
  const row = await db.query.observations.findFirst({
    where: eq(observations.id, obsId),
  });
  if (!row) return null;
  if (row.userId === userId) return row;
  if (await isTripMember(row.tripId, userId)) return row;
  return null;
}

observationRoutes.get("/", async (c) => {
  const user = c.get("user");
  const mappedOnly = c.req.query("mapped") === "1";
  const memberTrips = await listTripsForUser(user.id);
  const tripIds = memberTrips.map((t) => t.id);

  const scope =
    tripIds.length > 0
      ? or(eq(observations.userId, user.id), inArray(observations.tripId, tripIds))
      : eq(observations.userId, user.id);

  const rows = await db.query.observations.findMany({
    where: mappedOnly ? and(scope, isNotNull(observations.lat), isNotNull(observations.lng)) : scope,
    orderBy: [desc(observations.createdAt)],
  });
  return c.json({
    observations: rows.map((r) => serializeObservation(r, { redactPending: true })),
  });
});

observationRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const row = await loadAccessibleObservation(c.req.param("id"), user.id);
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

observationRoutes.patch("/:id/location", async (c) => {
  const user = c.get("user");
  const row = await db.query.observations.findFirst({
    where: and(eq(observations.id, c.req.param("id")), eq(observations.userId, user.id)),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }

  const parsed = z
    .object({
      lat: z.number().finite().gte(-90).lte(90),
      lng: z.number().finite().gte(-180).lte(180),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: t("detail.locationInvalid"), code: "location_invalid" }, 400);
  }

  const coords = validCoords(parsed.data.lat, parsed.data.lng);
  if (!coords) {
    return c.json({ error: t("detail.locationInvalid"), code: "location_invalid" }, 400);
  }
  const { lat, lng } = coords;
  const now = new Date();
  const hasIdentity = Boolean(row.finestReliableRank);

  let patch: Record<string, unknown> = { lat, lng, updatedAt: now };
  if (hasIdentity) {
    const derived = await computeSettle({
      lat,
      lng,
      finestReliableRank: row.finestReliableRank,
      scientificName: row.scientificName,
      commonName: row.commonName,
      taxonomyJson: row.taxonomyJson,
    });
    patch = {
      ...patch,
      countryCode: derived.countryCode,
      countrySource: derived.countrySource,
      locationLabel: derived.locationLabel,
      locationPrecise: derived.locationPrecise,
      alertIntroduced: derived.alertIntroduced,
      rarity: derived.rarity,
      settleTier: derived.settleTier,
      taxonKey: derived.taxonKey,
      acceptedTaxonomyJson: derived.acceptedTaxonomy
        ? JSON.stringify(derived.acceptedTaxonomy)
        : null,
    };
  } else {
    const country = await resolveCountry(lat, lng);
    patch = {
      ...patch,
      countryCode: country.code,
      countrySource: country.source,
      locationLabel: country.locationLabel,
      locationPrecise: Boolean(country.code),
    };
  }

  await db.update(observations).set(patch).where(eq(observations.id, row.id));

  const updated = await db.query.observations.findFirst({
    where: eq(observations.id, row.id),
  });
  if (!updated) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }

  if (updated.status === "settled") {
    await revokeCreditsForObservation(updated.id);
    await grantSharedProgressToAllMembers(updated);
  }

  return c.json({
    observation: serializeObservation(updated, { redactPending: true }),
  });
});

observationRoutes.post("/:id/settle", async (c) => {
  const user = c.get("user");
  const row = await loadAccessibleObservation(c.req.param("id"), user.id);
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
  if (!updated) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }

  const volumeEval = await grantSharedProgressToAllMembers(updated, user.id);

  return c.json({
    observation: serializeObservation(updated, { redactPending: false }),
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

  await revokeCreditsForObservation(row.id);
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

  // Soft cap: refuse re-run before wiping identity (photo stays; try again tomorrow / BYOK later).
  if (!(await usesOwnIdentifyKey(user.id)) && (await isPlatformIdentifyQuotaExhausted(user.id))) {
    const identifyQuota = await getIdentifyQuota(user.id);
    return c.json(
      {
        error: t("error.identifyDailyLimit"),
        code: "identify_daily_limit",
        identifyQuota,
      },
      429,
    );
  }

  await revokeCreditsForObservation(row.id);
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
      locationLabel: null,
      locationPrecise: null,
      alertIntroduced: false,
      taxonKey: null,
      acceptedTaxonomyJson: null,
      identifyProvider: null,
      identifyModel: null,
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
