import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { identifyDailyUsage } from "../db/schema.js";
import { env } from "../env.js";

export type IdentifyQuotaSnapshot = {
  /** UTC `YYYY-MM-DD`. */
  day: string;
  used: number;
  /** `0` means account cap disabled. */
  limit: number;
  /** `null` when unlimited. */
  remaining: number | null;
  limited: boolean;
  exhausted: boolean;
};

export function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function normalizeLimit(): number {
  const n = env.identifyDailyLimit;
  if (!Number.isFinite(n) || n < 0) return 100;
  return Math.floor(n);
}

export async function getIdentifyQuota(userId: string): Promise<IdentifyQuotaSnapshot> {
  const limit = normalizeLimit();
  const day = utcDayKey();
  const row = await db.query.identifyDailyUsage.findFirst({
    where: and(eq(identifyDailyUsage.userId, userId), eq(identifyDailyUsage.day, day)),
  });
  const used = row?.count ?? 0;
  const limited = limit > 0;
  return {
    day,
    used,
    limit,
    remaining: limited ? Math.max(0, limit - used) : null,
    limited,
    exhausted: limited && used >= limit,
  };
}

/** True when platform-default identify should be refused / skipped (account day cap). */
export async function isPlatformIdentifyQuotaExhausted(userId: string): Promise<boolean> {
  const q = await getIdentifyQuota(userId);
  return q.exhausted;
}

/**
 * Reserve one platform identify call for today.
 * Returns false if the account day cap is already exhausted.
 * No-op success when `IDENTIFY_DAILY_LIMIT` is 0.
 */
export async function tryConsumePlatformIdentifyQuota(userId: string): Promise<boolean> {
  const limit = normalizeLimit();
  if (limit <= 0) return true;

  const day = utcDayKey();
  const existing = await db.query.identifyDailyUsage.findFirst({
    where: and(eq(identifyDailyUsage.userId, userId), eq(identifyDailyUsage.day, day)),
  });

  if (!existing) {
    try {
      await db.insert(identifyDailyUsage).values({ userId, day, count: 1 });
      return true;
    } catch {
      // Concurrent first insert — fall through to conditional update.
    }
  }

  const before = await getIdentifyQuota(userId);
  if (before.exhausted) return false;

  await db
    .update(identifyDailyUsage)
    .set({ count: sql`${identifyDailyUsage.count} + 1` })
    .where(
      and(
        eq(identifyDailyUsage.userId, userId),
        eq(identifyDailyUsage.day, day),
        sql`${identifyDailyUsage.count} < ${limit}`,
      ),
    );

  const after = await getIdentifyQuota(userId);
  return after.used > before.used;
}
