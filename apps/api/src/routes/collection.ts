import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireUser, type Variables } from "../auth.js";
import { db } from "../db/index.js";
import { collectionEntries, observations, petCollectionEntries } from "../db/schema.js";
import { apiError } from "../errors.js";
import { sanitizeUserCollection } from "../services/collection.js";
import { rebuildPetTaxonForUser } from "../services/pets.js";
import { rebuildCollectionTaxonForUser } from "../services/shared-progress.js";
import { listTripsForUser } from "../services/trip-share.js";
import { displayBreedLabel } from "../pets/breeds.js";
import {
  observationDisplayUrl,
  serializeCollectionEntry,
  serializePetCollectionEntry,
} from "../serialize.js";
import { parseCollectionTaxonomy } from "../settle/taxon.js";

export const collectionRoutes = new Hono<{ Variables: Variables }>();
collectionRoutes.use("*", requireUser);

async function introducedTaxonKeys(userId: string, domesticated: boolean): Promise<Set<string>> {
  const rows = await db.query.observations.findMany({
    where: and(
      eq(observations.userId, userId),
      eq(observations.status, "settled"),
      eq(observations.alertIntroduced, true),
      eq(observations.domesticated, domesticated),
    ),
    columns: { taxonKey: true },
  });
  return new Set(rows.map((o) => o.taxonKey).filter((k): k is string => Boolean(k)));
}

async function taxonHasIntroducedAlert(
  userId: string,
  taxonKey: string,
  domesticated: boolean,
): Promise<boolean> {
  const row = await db.query.observations.findFirst({
    where: and(
      eq(observations.userId, userId),
      eq(observations.taxonKey, taxonKey),
      eq(observations.status, "settled"),
      eq(observations.alertIntroduced, true),
      eq(observations.domesticated, domesticated),
    ),
    columns: { id: true },
  });
  return Boolean(row);
}

async function sightingsForTaxon(
  userId: string,
  taxonKey: string,
  domesticated: boolean,
) {
  const memberTrips = await listTripsForUser(userId);
  const tripTitle = new Map(memberTrips.map((trip) => [trip.id, trip.title]));
  const tripIds = memberTrips.map((trip) => trip.id);
  const whereBase = [
    eq(observations.taxonKey, taxonKey),
    eq(observations.status, "settled"),
    eq(observations.domesticated, domesticated),
  ] as const;
  const sightingRows =
    tripIds.length > 0
      ? await db.query.observations.findMany({
          where: and(...whereBase, inArray(observations.tripId, tripIds)),
          orderBy: [desc(observations.settledAt), desc(observations.createdAt)],
        })
      : await db.query.observations.findMany({
          where: and(
            eq(observations.userId, userId),
            ...whereBase,
          ),
          orderBy: [desc(observations.settledAt), desc(observations.createdAt)],
        });
  return sightingRows.map((obs) => {
    const when = obs.capturedAt ?? obs.settledAt ?? obs.createdAt;
    return {
      observationId: obs.id,
      displayUrl: observationDisplayUrl(obs.displayPath),
      tripId: obs.tripId,
      tripTitle: tripTitle.get(obs.tripId) ?? "",
      occurredAt: when.toISOString(),
      breedZh: domesticated ? displayBreedLabel(obs.taxonKey, obs.breedZh) : null,
    };
  });
}

collectionRoutes.get("/", async (c) => {
  const user = c.get("user");
  await sanitizeUserCollection(user.id);
  const rows = await db.query.collectionEntries.findMany({
    where: eq(collectionEntries.userId, user.id),
    orderBy: [desc(collectionEntries.updatedAt)],
  });

  const alertedTaxa = await introducedTaxonKeys(user.id, false);

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

collectionRoutes.get("/pets", async (c) => {
  const user = c.get("user");
  const { sanitizeUserPets } = await import("../services/pets.js");
  await sanitizeUserPets(user.id);
  const rows = await db.query.petCollectionEntries.findMany({
    where: eq(petCollectionEntries.userId, user.id),
    orderBy: [desc(petCollectionEntries.updatedAt)],
  });

  const alertedTaxa = await introducedTaxonKeys(user.id, true);
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
      return serializePetCollectionEntry(entry, coverUrl, {
        taxonomy,
        alertIntroduced: alertedTaxa.has(entry.taxonKey),
      });
    }),
  );

  return c.json({ entries: payload });
});

collectionRoutes.get("/pets/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const row = await db.query.petCollectionEntries.findFirst({
    where: and(eq(petCollectionEntries.id, id), eq(petCollectionEntries.userId, user.id)),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }

  await rebuildPetTaxonForUser(user.id, row.taxonKey);
  const entry = await db.query.petCollectionEntries.findFirst({
    where: and(eq(petCollectionEntries.id, id), eq(petCollectionEntries.userId, user.id)),
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

  return c.json({
    entry: serializePetCollectionEntry(entry, coverUrl, {
      taxonomy,
      alertIntroduced: await taxonHasIntroducedAlert(user.id, entry.taxonKey, true),
    }),
    sightings: await sightingsForTaxon(user.id, entry.taxonKey, true),
  });
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

  const alerted = await taxonHasIntroducedAlert(user.id, entry.taxonKey, false);

  return c.json({
    entry: serializeCollectionEntry(entry, coverUrl, {
      alertIntroduced: Boolean(alerted),
      taxonomy,
    }),
    sightings: await sightingsForTaxon(user.id, entry.taxonKey, false),
  });
});
