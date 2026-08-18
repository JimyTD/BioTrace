import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireUser, type Variables } from "../auth.js";
import { db } from "../db/index.js";
import { collectionEntries, observations } from "../db/schema.js";
import { apiError } from "../errors.js";
import { sanitizeUserCollection } from "../services/collection.js";
import { rebuildCollectionTaxonForUser } from "../services/shared-progress.js";
import { listTripsForUser } from "../services/trip-share.js";
import { observationDisplayUrl, serializeCollectionEntry } from "../serialize.js";
import { parseCollectionTaxonomy } from "../settle/taxon.js";

export const collectionRoutes = new Hono<{ Variables: Variables }>();

collectionRoutes.use("*", requireUser);

collectionRoutes.get("/", async (c) => {
  const user = c.get("user");
  await sanitizeUserCollection(user.id);
  const rows = await db.query.collectionEntries.findMany({
    where: eq(collectionEntries.userId, user.id),
    orderBy: [desc(collectionEntries.updatedAt)],
  });

  const alertedObs = await db.query.observations.findMany({
    where: and(
      eq(observations.userId, user.id),
      eq(observations.status, "settled"),
      eq(observations.alertIntroduced, true),
    ),
    columns: { taxonKey: true },
  });
  const alertedTaxa = new Set(
    alertedObs.map((o) => o.taxonKey).filter((k): k is string => Boolean(k)),
  );

  const payload = await Promise.all(
    rows.map(async (entry) => {
      let coverUrl: string | null = null;
      let taxonomy = null;
      if (entry.coverObservationId) {
        const obs = await db.query.observations.findFirst({
          where: eq(observations.id, entry.coverObservationId),
        });
        if (obs) {
          coverUrl = observationDisplayUrl(obs.displayPath);
          taxonomy = parseCollectionTaxonomy(obs);
        }
      }
      return serializeCollectionEntry(entry, coverUrl, {
        alertIntroduced: alertedTaxa.has(entry.taxonKey),
        taxonomy,
      });
    }),
  );

  return c.json({ entries: payload });
});

collectionRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const row = await db.query.collectionEntries.findFirst({
    where: and(eq(collectionEntries.id, id), eq(collectionEntries.userId, user.id)),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }

  await rebuildCollectionTaxonForUser(user.id, row.taxonKey);
  const entry = await db.query.collectionEntries.findFirst({
    where: and(eq(collectionEntries.id, id), eq(collectionEntries.userId, user.id)),
  });
  if (!entry) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }

  let coverUrl: string | null = null;
  let taxonomy = null;
  if (entry.coverObservationId) {
    const cover = await db.query.observations.findFirst({
      where: eq(observations.id, entry.coverObservationId),
    });
    if (cover) {
      coverUrl = observationDisplayUrl(cover.displayPath);
      taxonomy = parseCollectionTaxonomy(cover);
    }
  }

  const alerted = await db.query.observations.findFirst({
    where: and(
      eq(observations.userId, user.id),
      eq(observations.taxonKey, entry.taxonKey),
      eq(observations.status, "settled"),
      eq(observations.alertIntroduced, true),
    ),
    columns: { id: true },
  });

  const memberTrips = await listTripsForUser(user.id);
  const tripTitle = new Map(memberTrips.map((trip) => [trip.id, trip.title]));
  const tripIds = memberTrips.map((trip) => trip.id);
  const sightingRows =
    tripIds.length > 0
      ? await db.query.observations.findMany({
          where: and(
            eq(observations.taxonKey, entry.taxonKey),
            eq(observations.status, "settled"),
            inArray(observations.tripId, tripIds),
          ),
          orderBy: [desc(observations.settledAt), desc(observations.createdAt)],
        })
      : await db.query.observations.findMany({
          where: and(
            eq(observations.userId, user.id),
            eq(observations.taxonKey, entry.taxonKey),
            eq(observations.status, "settled"),
          ),
          orderBy: [desc(observations.settledAt), desc(observations.createdAt)],
        });

  return c.json({
    entry: serializeCollectionEntry(entry, coverUrl, {
      alertIntroduced: Boolean(alerted),
      taxonomy,
    }),
    sightings: sightingRows.map((obs) => {
      const when = obs.capturedAt ?? obs.settledAt ?? obs.createdAt;
      return {
        observationId: obs.id,
        displayUrl: observationDisplayUrl(obs.displayPath),
        tripId: obs.tripId,
        tripTitle: tripTitle.get(obs.tripId) ?? "",
        occurredAt: when.toISOString(),
      };
    }),
  });
});
