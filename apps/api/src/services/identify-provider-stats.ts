import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { identifyProviderDaily } from "../db/schema.js";
import type { ProviderId } from "../identify/health.js";
import { utcDayKey } from "./identify-quota.js";

export type ProviderDayStats = {
  success: number;
  fail: number;
  exhaustedAt: Date | null;
  successAtExhaust: number | null;
};

const empty: ProviderDayStats = {
  success: 0,
  fail: 0,
  exhaustedAt: null,
  successAtExhaust: null,
};

export async function bumpProviderStat(provider: ProviderId, kind: "success" | "fail") {
  const day = utcDayKey();
  await db
    .insert(identifyProviderDaily)
    .values({
      provider,
      day,
      success: kind === "success" ? 1 : 0,
      fail: kind === "fail" ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [identifyProviderDaily.provider, identifyProviderDaily.day],
      set: {
        success: sql`${identifyProviderDaily.success} + ${kind === "success" ? 1 : 0}`,
        fail: sql`${identifyProviderDaily.fail} + ${kind === "fail" ? 1 : 0}`,
      },
    });
}

/** Snapshot Gemini success count the first time Google reports daily quota exhausted. */
export async function markGeminiExhaustedToday() {
  const day = utcDayKey();
  const existing = await db.query.identifyProviderDaily.findFirst({
    where: and(eq(identifyProviderDaily.provider, "gemini"), eq(identifyProviderDaily.day, day)),
  });
  if (existing?.exhaustedAt) return;
  const now = new Date();
  if (!existing) {
    await db.insert(identifyProviderDaily).values({
      provider: "gemini",
      day,
      success: 0,
      fail: 0,
      exhaustedAt: now,
      successAtExhaust: 0,
    });
    return;
  }
  await db
    .update(identifyProviderDaily)
    .set({ exhaustedAt: now, successAtExhaust: existing.success })
    .where(and(eq(identifyProviderDaily.provider, "gemini"), eq(identifyProviderDaily.day, day)));
}

export async function providerStatsToday(): Promise<Record<ProviderId, ProviderDayStats>> {
  const day = utcDayKey();
  const rows = await db.query.identifyProviderDaily.findMany({
    where: eq(identifyProviderDaily.day, day),
  });
  const out: Record<ProviderId, ProviderDayStats> = {
    gemini: { ...empty },
    tokenhub: { ...empty },
  };
  for (const row of rows) {
    if (row.provider === "gemini" || row.provider === "tokenhub") {
      out[row.provider] = {
        success: row.success,
        fail: row.fail,
        exhaustedAt: row.exhaustedAt ?? null,
        successAtExhaust: row.successAtExhaust ?? null,
      };
    }
  }
  return out;
}
