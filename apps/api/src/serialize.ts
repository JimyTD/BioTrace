import { normalizeTaxonomy } from "./identify/types.js";
import type { CollectionEntry, Observation, Trip, User } from "./db/schema.js";

export function serializeUser(user: User) {
  return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
}

export function serializeTrip(trip: Trip) {
  return {
    id: trip.id,
    userId: trip.userId,
    title: trip.title,
    createdAt: trip.createdAt.toISOString(),
  };
}

export function serializeObservation(
  obs: Observation,
  opts?: { redactPending?: boolean },
) {
  const redact = opts?.redactPending !== false && obs.status === "pending_settle";

  let taxonomy = null;
  if (!redact && obs.taxonomyJson) {
    try {
      taxonomy = normalizeTaxonomy(JSON.parse(obs.taxonomyJson));
    } catch {
      taxonomy = null;
    }
  }

  return {
    id: obs.id,
    tripId: obs.tripId,
    userId: obs.userId,
    status: obs.status,
    description: obs.description,
    capturedAt: obs.capturedAt ? obs.capturedAt.toISOString() : null,
    lat: obs.lat,
    lng: obs.lng,
    displayUrl: `/api/files/${obs.displayPath.replace(/\\/g, "/")}`,
    commonName: redact ? null : obs.commonName,
    scientificName: redact ? null : obs.scientificName,
    finestReliableRank: redact ? null : obs.finestReliableRank,
    confidence: redact ? null : obs.confidence,
    taxonomy,
    blurb: redact ? null : obs.blurb,
    notes: redact ? null : obs.notes,
    error: obs.error,
    settleTier: obs.settleTier,
    rarity: redact ? null : obs.rarity,
    countryCode: obs.countryCode,
    locationPrecise: obs.locationPrecise,
    alertIntroduced: redact ? false : Boolean(obs.alertIntroduced),
    taxonKey: redact ? null : obs.taxonKey,
    identifyProvider: redact ? null : obs.identifyProvider ?? null,
    settledAt: obs.settledAt ? obs.settledAt.toISOString() : null,
    createdAt: obs.createdAt.toISOString(),
    updatedAt: obs.updatedAt.toISOString(),
    pendingReveal: obs.status === "pending_settle",
  };
}

export function serializeCollectionEntry(
  entry: CollectionEntry,
  coverDisplayUrl?: string | null,
) {
  return {
    id: entry.id,
    taxonKey: entry.taxonKey,
    commonName: entry.commonName,
    scientificName: entry.scientificName,
    rarity: entry.rarity,
    coverObservationId: entry.coverObservationId,
    coverDisplayUrl: coverDisplayUrl ?? null,
    firstCollectedAt: entry.firstCollectedAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
