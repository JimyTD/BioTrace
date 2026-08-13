import { and, count, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  observations,
  rarityCache,
  sharedCollectionCredits,
} from "../db/schema.js";
import {
  parseEncounterCacheKey,
  resolveEncounterRarity,
} from "../rarity/encounter.js";
import { rebuildCollectionTaxonForUser } from "../services/shared-progress.js";

function iso(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

function sanitizeLike(q: string) {
  return q.replace(/[%_]/g, "");
}

function observationCountryClause(cacheCountry: string) {
  const cc = cacheCountry.trim().toUpperCase();
  if (cc === "CN") {
    return or(
      eq(observations.countryCode, "CN"),
      isNull(observations.countryCode),
      eq(observations.countryCode, ""),
    );
  }
  return eq(observations.countryCode, cc);
}

function scoredObservationClause(cacheCountry: string, taxonKey: string) {
  return and(
    eq(observations.taxonKey, taxonKey),
    observationCountryClause(cacheCountry),
    inArray(observations.status, ["pending_settle", "settled"]),
  );
}

async function taxonKeysMatchingQuery(q: string): Promise<string[]> {
  const needle = `%${sanitizeLike(q)}%`;
  const rows = await db
    .selectDistinct({ taxonKey: observations.taxonKey })
    .from(observations)
    .where(
      and(
        sql`${observations.taxonKey} is not null`,
        or(
          like(observations.taxonKey, needle),
          like(observations.scientificName, needle),
          like(observations.commonName, needle),
        ),
      ),
    )
    .limit(80);
  return rows.map((r) => r.taxonKey).filter((k): k is string => Boolean(k));
}

function effectiveObsCount(
  cacheCountry: string,
  taxonKey: string,
  groups: Array<{ taxonKey: string | null; countryCode: string | null; n: number }>,
) {
  let n = 0;
  for (const g of groups) {
    if (g.taxonKey !== taxonKey) continue;
    const effective = g.countryCode?.trim().toUpperCase() || "CN";
    if (effective === cacheCountry.trim().toUpperCase()) n += g.n;
  }
  return n;
}

export async function listRarityCache(opts: { q?: string; limit: number; offset: number }) {
  const q = opts.q?.trim() ?? "";
  const filters = [];
  if (q) {
    const needle = `%${sanitizeLike(q)}%`;
    const taxa = await taxonKeysMatchingQuery(q);
    const taxonLikes = taxa.map((taxon) => like(rarityCache.cacheKey, `%|${sanitizeLike(taxon)}`));
    const combined = taxonLikes.length
      ? or(like(rarityCache.cacheKey, needle), ...taxonLikes)
      : like(rarityCache.cacheKey, needle);
    filters.push(combined);
  }
  const where = filters.length ? and(...filters) : undefined;

  const totalRow = await db.select({ n: count() }).from(rarityCache).where(where);
  const rows = await db.query.rarityCache.findMany({
    where,
    orderBy: [desc(rarityCache.fetchedAt)],
    limit: opts.limit,
    offset: opts.offset,
  });

  const parsed = rows.map((row) => ({ row, parsed: parseEncounterCacheKey(row.cacheKey) }));
  const taxonKeys = [
    ...new Set(parsed.map((p) => p.parsed?.taxonKey).filter((k): k is string => Boolean(k))),
  ];
  const groups =
    taxonKeys.length > 0
      ? await db
          .select({
            taxonKey: observations.taxonKey,
            countryCode: observations.countryCode,
            n: count(),
          })
          .from(observations)
          .where(
            and(
              inArray(observations.taxonKey, taxonKeys),
              inArray(observations.status, ["pending_settle", "settled"]),
            ),
          )
          .groupBy(observations.taxonKey, observations.countryCode)
      : [];

  return {
    total: totalRow[0]?.n ?? 0,
    items: parsed.map(({ row, parsed: parts }) => ({
      cacheKey: row.cacheKey,
      rarity: row.rarity,
      source: row.source,
      fetchedAt: iso(row.fetchedAt),
      version: parts?.version ?? null,
      countryCode: parts?.countryCode ?? null,
      taxonKey: parts?.taxonKey ?? null,
      observationCount:
        parts != null ? effectiveObsCount(parts.countryCode, parts.taxonKey, groups) : 0,
    })),
  };
}

export async function getRarityCacheEntry(cacheKey: string) {
  const row = await db.query.rarityCache.findFirst({
    where: eq(rarityCache.cacheKey, cacheKey),
  });
  if (!row) return null;
  const parts = parseEncounterCacheKey(row.cacheKey);
  const where = parts ? scoredObservationClause(parts.countryCode, parts.taxonKey) : undefined;
  const obsCount = where
    ? ((await db.select({ n: count() }).from(observations).where(where))[0]?.n ?? 0)
    : 0;
  const obs = where
    ? await db.query.observations.findMany({
        where,
        orderBy: [desc(observations.updatedAt)],
        limit: 50,
      })
    : [];
  return {
    cacheKey: row.cacheKey,
    rarity: row.rarity,
    source: row.source,
    fetchedAt: iso(row.fetchedAt),
    version: parts?.version ?? null,
    countryCode: parts?.countryCode ?? null,
    taxonKey: parts?.taxonKey ?? null,
    observationCount: obsCount,
    observations: obs.map((o) => ({
      id: o.id,
      status: o.status,
      rarity: o.rarity,
      commonName: o.commonName,
      scientificName: o.scientificName,
      countryCode: o.countryCode,
      userId: o.userId,
    })),
  };
}

export async function deleteRarityCacheKey(cacheKey: string) {
  const r = await db.delete(rarityCache).where(eq(rarityCache.cacheKey, cacheKey));
  return r.rowsAffected ?? 0;
}

export async function rescoreRarityCache(cacheKey: string) {
  const parts = parseEncounterCacheKey(cacheKey);
  if (!parts) return { error: "bad_key" as const };

  const sample = await db.query.observations.findFirst({
    where: and(eq(observations.taxonKey, parts.taxonKey), observationCountryClause(parts.countryCode)),
    orderBy: [desc(observations.updatedAt)],
  });

  const previous = await db.query.rarityCache.findFirst({
    where: eq(rarityCache.cacheKey, cacheKey),
  });

  const resolved = await resolveEncounterRarity({
    taxonKey: parts.taxonKey,
    countryCode: parts.countryCode,
    label: sample?.commonName ?? sample?.scientificName ?? parts.taxonKey,
    scientificName: sample?.scientificName ?? parts.taxonKey,
    finestReliableRank: sample?.finestReliableRank ?? null,
    skipCache: true,
  });

  if (resolved.source !== "encounter") {
    return {
      error: "encounter_failed" as const,
      previousRarity: previous?.rarity ?? null,
      source: resolved.source,
    };
  }

  const now = new Date();
  const toUpdate = await db.query.observations.findMany({
    where: scoredObservationClause(parts.countryCode, parts.taxonKey),
  });
  if (toUpdate.length > 0) {
    await db
      .update(observations)
      .set({ rarity: resolved.rarity, updatedAt: now })
      .where(
        inArray(
          observations.id,
          toUpdate.map((o) => o.id),
        ),
      );
  }

  const rebuildIds = new Set(toUpdate.map((o) => o.userId));
  if (toUpdate.length > 0) {
    const credits = await db.query.sharedCollectionCredits.findMany({
      where: and(
        eq(sharedCollectionCredits.taxonKey, parts.taxonKey),
        inArray(
          sharedCollectionCredits.observationId,
          toUpdate.map((o) => o.id),
        ),
      ),
    });
    for (const c of credits) rebuildIds.add(c.userId);
  }
  for (const userId of rebuildIds) {
    await rebuildCollectionTaxonForUser(userId, parts.taxonKey);
  }

  const updated = await db.query.rarityCache.findFirst({
    where: eq(rarityCache.cacheKey, cacheKey),
  });

  return {
    cacheKey,
    previousRarity: previous?.rarity ?? null,
    rarity: resolved.rarity,
    source: resolved.source,
    frequency: resolved.frequency,
    adjustments: resolved.adjustments,
    fetchedAt: iso(updated?.fetchedAt),
    observationsUpdated: toUpdate.length,
    collectionsUpdated: rebuildIds.size,
  };
}
