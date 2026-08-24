import { normalizeTaxonomy, type Taxonomy } from "./identify/types.js";
import type { CollectionEntry, Observation, Trip, User } from "./db/schema.js";
import { lookupListed, statusTagsFrom, type StatusTag } from "./rarity/cn-status.js";
import type { TripSummaryResolved } from "./trips/summary.js";

function tagsForNames(
  input: {
    scientificName?: string | null;
    taxonKey?: string | null;
    commonName?: string | null;
  },
  introduced: boolean,
): StatusTag[] {
  return statusTagsFrom(
    lookupListed({
      scientificName: input.scientificName,
      taxonKey: input.taxonKey,
      label: input.commonName,
    }),
    introduced,
  );
}

export function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export type TripSerializeExtras = {
  coverDisplayUrl?: string | null;
  observationCount?: number;
  summary?: TripSummaryResolved | null;
  memberCount?: number;
  isAdmin?: boolean;
  /** Invite code only when requester is admin. */
  inviteCode?: string | null;
  allowJoin?: boolean;
};

export function serializeTrip(trip: Trip, extras?: TripSerializeExtras) {
  const summary = extras?.summary;
  return {
    id: trip.id,
    userId: trip.userId,
    title: trip.title,
    createdAt: trip.createdAt.toISOString(),
    metaManualEnabled: Boolean(trip.metaManualEnabled),
    manualDateText: trip.manualDateText ?? null,
    manualPlaceText: trip.manualPlaceText ?? null,
    coverDisplayUrl: extras?.coverDisplayUrl ?? null,
    observationCount: extras?.observationCount ?? 0,
    autoDateSummary: summary?.autoDateSummary ?? null,
    autoPlaceSummary: summary?.autoPlaceSummary ?? null,
    dateSummary: summary?.dateSummary ?? null,
    placeSummary: summary?.placeSummary ?? null,
    memberCount: extras?.memberCount ?? 1,
    isAdmin: extras?.isAdmin ?? false,
    allowJoin: Boolean(trip.allowJoin),
    inviteCode: extras?.inviteCode ?? null,
  };
}

export function observationDisplayUrl(displayPath: string) {
  return `/api/files/${displayPath.replace(/\\/g, "/")}`;
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
    displayUrl: observationDisplayUrl(obs.displayPath),
    /** 原图 URL（相册高清）；旧数据可能没有 */
    originalUrl: obs.originalPath ? observationDisplayUrl(obs.originalPath) : null,
    locationLabel: obs.locationLabel ?? null,
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
    tags: redact
      ? []
      : tagsForNames(obs, Boolean(obs.alertIntroduced)),
    taxonKey: redact ? null : obs.taxonKey,
    identifyProvider: redact ? null : obs.identifyProvider ?? null,
    identifyModel: redact ? null : obs.identifyModel ?? null,
    settledAt: obs.settledAt ? obs.settledAt.toISOString() : null,
    createdAt: obs.createdAt.toISOString(),
    updatedAt: obs.updatedAt.toISOString(),
    pendingReveal: obs.status === "pending_settle",
  };
}

export function serializeCollectionEntry(
  entry: CollectionEntry,
  coverDisplayUrl?: string | null,
  opts?: { alertIntroduced?: boolean; taxonomy?: Taxonomy | null },
) {
  return {
    id: entry.id,
    taxonKey: entry.taxonKey,
    commonName: entry.commonName,
    scientificName: entry.scientificName,
    rarity: entry.rarity,
    /** 该种任意已结算观察曾命中引入警示（图鉴轻标；详情仍看单条观察）。 */
    alertIntroduced: Boolean(opts?.alertIntroduced),
    tags: tagsForNames(entry, Boolean(opts?.alertIntroduced)),
    coverObservationId: entry.coverObservationId,
    coverDisplayUrl: coverDisplayUrl ?? null,
    firstCollectedAt: entry.firstCollectedAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    taxonomy: opts?.taxonomy ?? null,
  };
}
