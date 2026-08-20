import { and, count, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  observations,
  rarityCache,
  sharedCollectionCredits,
} from "../db/schema.js";
import {
  effectiveCountry,
  parseScaleCacheKey,
  resolveScaleRarity,
  scaleCacheKey,
} from "../rarity/scale.js";
import { rebuildCollectionTaxonForUser } from "../services/shared-progress.js";

function iso(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

function sanitizeLike(q: string) {
  return q.replace(/[%_]/g, "");
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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

  const parsed = rows.map((row) => ({ row, parsed: parseScaleCacheKey(row.cacheKey) }));
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
      score: row.score ?? null,
      model: row.model ?? null,
      samples: row.samples ?? null,
      listLevel: row.listLevel ?? null,
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
  const parts = parseScaleCacheKey(row.cacheKey);
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
    score: row.score ?? null,
    model: row.model ?? null,
    samples: row.samples ?? null,
    listLevel: row.listLevel ?? null,
    items: parseJson<Record<string, boolean | null>>(row.itemsJson),
    adjustments: parseJson<string[]>(row.adjustmentsJson) ?? [],
    reasons: parseJson<Record<string, string>>(row.reasonsJson) ?? {},
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
  const parts = parseScaleCacheKey(cacheKey);
  if (!parts) return { error: "bad_key" as const };

  const sample = await db.query.observations.findFirst({
    where: and(eq(observations.taxonKey, parts.taxonKey), observationCountryClause(parts.countryCode)),
    orderBy: [desc(observations.updatedAt)],
  });

  const previous = await db.query.rarityCache.findFirst({
    where: eq(rarityCache.cacheKey, cacheKey),
  });

  const resolved = await resolveScaleRarity({
    taxonKey: parts.taxonKey,
    countryCode: parts.countryCode,
    label: sample?.commonName ?? sample?.scientificName ?? parts.taxonKey,
    scientificName: sample?.scientificName ?? parts.taxonKey,
    finestReliableRank: sample?.finestReliableRank ?? null,
    skipCache: true,
  });

  if (resolved.source === "unavailable") {
    return {
      error: "scale_failed" as const,
      previousRarity: previous?.rarity ?? null,
      source: resolved.source,
    };
  }

  const applied = await applyRarity(parts.countryCode, parts.taxonKey, resolved.rarity);

  const updated = await db.query.rarityCache.findFirst({
    where: eq(rarityCache.cacheKey, cacheKey),
  });

  return {
    cacheKey,
    previousRarity: previous?.rarity ?? null,
    rarity: resolved.rarity,
    source: resolved.source,
    score: resolved.score,
    model: resolved.model,
    samples: resolved.samples,
    listLevel: resolved.listLevel,
    adjustments: resolved.adjustments,
    fetchedAt: iso(updated?.fetchedAt),
    observationsUpdated: applied.observationsUpdated,
    collectionsUpdated: applied.collectionsUpdated,
  };
}

/**
 * 把新档位刷到该国该物种的已结算观测上，并重建受影响用户的图鉴聚合。
 * 共享行程里别人替你点亮的那一格也要跟着变，所以要连 shared_collection_credits 一起收。
 */
async function applyRarity(countryCode: string, taxonKey: string, rarity: string) {
  const now = new Date();
  const toUpdate = await db.query.observations.findMany({
    where: scoredObservationClause(countryCode, taxonKey),
  });
  if (toUpdate.length === 0) return { observationsUpdated: 0, collectionsUpdated: 0 };

  const ids = toUpdate.map((o) => o.id);
  await db
    .update(observations)
    .set({ rarity, updatedAt: now })
    .where(inArray(observations.id, ids));

  const rebuildIds = new Set(toUpdate.map((o) => o.userId));
  const credits = await db.query.sharedCollectionCredits.findMany({
    where: and(
      eq(sharedCollectionCredits.taxonKey, taxonKey),
      inArray(sharedCollectionCredits.observationId, ids),
    ),
  });
  for (const c of credits) rebuildIds.add(c.userId);
  for (const userId of rebuildIds) {
    await rebuildCollectionTaxonForUser(userId, taxonKey);
  }
  return { observationsUpdated: ids.length, collectionsUpdated: rebuildIds.size };
}

type PendingTaxon = {
  countryCode: string;
  taxonKey: string;
  cacheKey: string;
  label: string | null;
  scientificName: string | null;
  finestReliableRank: string | null;
};

/** 已结算观测里出现过、但还没有量表缓存的「国家 + 物种」组合。 */
async function pendingTaxa(): Promise<PendingTaxon[]> {
  const rows = await db
    .selectDistinct({
      taxonKey: observations.taxonKey,
      countryCode: observations.countryCode,
      commonName: observations.commonName,
      scientificName: observations.scientificName,
      finestReliableRank: observations.finestReliableRank,
    })
    .from(observations)
    .where(
      and(
        sql`${observations.taxonKey} is not null`,
        inArray(observations.status, ["pending_settle", "settled"]),
      ),
    );

  const existing = new Set(
    (await db.select({ cacheKey: rarityCache.cacheKey }).from(rarityCache)).map((r) => r.cacheKey),
  );

  const seen = new Set<string>();
  const out: PendingTaxon[] = [];
  for (const r of rows) {
    if (!r.taxonKey) continue;
    const countryCode = effectiveCountry(r.countryCode);
    const cacheKey = scaleCacheKey(countryCode, r.taxonKey);
    if (existing.has(cacheKey) || seen.has(cacheKey)) continue;
    seen.add(cacheKey);
    out.push({
      countryCode,
      taxonKey: r.taxonKey,
      cacheKey,
      label: r.commonName ?? r.scientificName,
      scientificName: r.scientificName,
      finestReliableRank: r.finestReliableRank,
    });
  }
  return out;
}

/**
 * 迁移工具：把老算法留下的档位按量表重打一遍。
 * 只处理还没有量表缓存的物种，天然幂等；每次最多 limit 个，剩余数回给后台接着点。
 * 灭绝名录内的物种不调模型；其余每个 3 次调用起（贴界补到 9 次）。
 */
export async function recomputeRarityBatch(opts: { limit: number }) {
  const pending = await pendingTaxa();
  const batch = pending.slice(0, Math.max(1, opts.limit));

  const changes: Array<{
    taxonKey: string;
    countryCode: string;
    rarity: string;
    score: number | null;
    model: string | null;
    samples: number;
    observationsUpdated: number;
  }> = [];
  const failed: string[] = [];

  for (const item of batch) {
    const resolved = await resolveScaleRarity({
      taxonKey: item.taxonKey,
      countryCode: item.countryCode,
      label: item.label,
      scientificName: item.scientificName,
      finestReliableRank: item.finestReliableRank,
    });
    if (resolved.source === "unavailable") {
      failed.push(item.taxonKey);
      // 全链不可用时停手：接着刷只会把整批都记成失败。
      break;
    }
    const applied = await applyRarity(item.countryCode, item.taxonKey, resolved.rarity);
    changes.push({
      taxonKey: item.taxonKey,
      countryCode: item.countryCode,
      rarity: resolved.rarity,
      score: resolved.score,
      model: resolved.model,
      samples: resolved.samples,
      observationsUpdated: applied.observationsUpdated,
    });
  }

  return {
    processed: changes.length,
    failed,
    remaining: Math.max(0, pending.length - changes.length),
    changes,
  };
}
