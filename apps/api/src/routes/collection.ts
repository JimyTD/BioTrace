import { Hono } from "hono";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
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

/**
 * 图鉴聚合没有国别，保护标签按「这一物种在中国境内拍没拍过」定。
 *
 * 图鉴页展示的是「你遇见过它」，只要国内遇见过，中国名录对这一格就成立；
 * 只在国外拍过的物种，图鉴里不挂中国保护级。口径与观察页逐条判定保持一致，
 * 无国别视为中国（见 rarity/cn-status isListJurisdiction）。
 */
const LIST_JURISDICTION_COUNTRIES = ["CN", ""] as const;

async function listedTaxonKeysForUser(
  userId: string,
  domesticated: boolean,
): Promise<Set<string>> {
  const rows = await db.query.observations.findMany({
    where: and(
      eq(observations.userId, userId),
      inArray(observations.status, ["pending_settle", "settled"]),
      eq(observations.domesticated, domesticated),
      or(
        eq(observations.countryCode, LIST_JURISDICTION_COUNTRIES[0]),
        eq(observations.countryCode, LIST_JURISDICTION_COUNTRIES[1]),
        isNull(observations.countryCode),
      ),
    ),
    columns: { taxonKey: true },
  });
  return new Set(rows.map((o) => o.taxonKey).filter((k): k is string => Boolean(k)));
}

async function hasListedTaxonForUser(
  userId: string,
  taxonKey: string,
  domesticated: boolean,
): Promise<boolean> {
  const row = await db.query.observations.findFirst({
    where: and(
      eq(observations.userId, userId),
      eq(observations.taxonKey, taxonKey),
      inArray(observations.status, ["pending_settle", "settled"]),
      eq(observations.domesticated, domesticated),
      or(
        eq(observations.countryCode, LIST_JURISDICTION_COUNTRIES[0]),
        eq(observations.countryCode, LIST_JURISDICTION_COUNTRIES[1]),
        isNull(observations.countryCode),
      ),
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

type PetPlateObs = {
  id: string;
  taxonKey: string | null;
  displayPath: string;
  breedZh: string | null;
};

type PetPlateExtras = {
  sightingCount: number;
  faces: string[];
  breeds: Array<string | null>;
};

async function petPlateExtras(
  userId: string,
  rows: Array<{ taxonKey: string; coverObservationId: string | null }>,
): Promise<Map<string, PetPlateExtras>> {
  const out = new Map<string, PetPlateExtras>();
  const taxonKeys = [...new Set(rows.map((r) => r.taxonKey).filter(Boolean))];
  if (taxonKeys.length === 0) return out;

  const memberTrips = await listTripsForUser(userId);
  const tripIds = memberTrips.map((trip) => trip.id);
  const whereBase = [
    eq(observations.status, "settled"),
    eq(observations.domesticated, true),
    inArray(observations.taxonKey, taxonKeys),
  ] as const;
  const obs: PetPlateObs[] =
    tripIds.length > 0
      ? await db.query.observations.findMany({
          where: and(...whereBase, inArray(observations.tripId, tripIds)),
          orderBy: [desc(observations.settledAt), desc(observations.createdAt)],
          columns: { id: true, taxonKey: true, displayPath: true, breedZh: true },
        })
      : await db.query.observations.findMany({
          where: and(eq(observations.userId, userId), ...whereBase),
          orderBy: [desc(observations.settledAt), desc(observations.createdAt)],
          columns: { id: true, taxonKey: true, displayPath: true, breedZh: true },
        });

  const grouped = new Map<string, PetPlateObs[]>();
  for (const row of obs) {
    if (!row.taxonKey) continue;
    const list = grouped.get(row.taxonKey);
    if (list) list.push(row);
    else grouped.set(row.taxonKey, [row]);
  }

  for (const entry of rows) {
    const list = grouped.get(entry.taxonKey) ?? [];
    const faces: string[] = [];
    const seenFace = new Set<string>();
    const pushFace = (url: string | null | undefined) => {
      if (!url || seenFace.has(url) || faces.length >= 6) return;
      seenFace.add(url);
      faces.push(url);
    };
    const cover = entry.coverObservationId
      ? list.find((item) => item.id === entry.coverObservationId)
      : undefined;
    if (cover) pushFace(observationDisplayUrl(cover.displayPath));
    for (const item of list) pushFace(observationDisplayUrl(item.displayPath));

    const breeds: Array<string | null> = [];
    const seenBreed = new Set<string>();
    for (const item of list) {
      const label = displayBreedLabel(entry.taxonKey, item.breedZh);
      const key = label ?? "";
      if (seenBreed.has(key)) continue;
      seenBreed.add(key);
      breeds.push(label);
    }

    out.set(entry.taxonKey, {
      sightingCount: Math.max(list.length, faces.length),
      faces,
      breeds,
    });
  }
  return out;
}

collectionRoutes.get("/", async (c) => {
  const user = c.get("user");
  await sanitizeUserCollection(user.id);
  const rows = await db.query.collectionEntries.findMany({
    where: eq(collectionEntries.userId, user.id),
    orderBy: [desc(collectionEntries.updatedAt)],
  });

  const alertedTaxa = await introducedTaxonKeys(user.id, true);
  const listedTaxa = await listedTaxonKeysForUser(user.id, false);
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
        listJurisdiction: listedTaxa.has(entry.taxonKey),
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
  const plates = await petPlateExtras(user.id, rows);
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
      const plate = plates.get(entry.taxonKey);
      return serializePetCollectionEntry(entry, coverUrl, {
        taxonomy,
        alertIntroduced: alertedTaxa.has(entry.taxonKey),
        sightingCount: plate?.sightingCount ?? 0,
        faces: plate?.faces ?? (coverUrl ? [coverUrl] : []),
        breeds: plate?.breeds ?? [],
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
  const listed = await hasListedTaxonForUser(user.id, entry.taxonKey, false);

  return c.json({
    entry: serializeCollectionEntry(entry, coverUrl, {
      alertIntroduced: Boolean(alerted),
      listJurisdiction: listed,
      taxonomy,
    }),
    sightings: await sightingsForTaxon(user.id, entry.taxonKey, false),
  });
});
