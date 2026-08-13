import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { t } from "@biotrace/messages";
import { and, count, desc, eq, inArray, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  clearAdminSessionCookie,
  requireAdmin,
  setAdminSessionCookie,
  type AdminVariables,
} from "../admin/auth.js";
import { listAudit, writeAudit } from "../admin/audit.js";
import { applyRuntimeSecrets, patchRuntimeSecretSlot, secretsPublicView } from "../admin/runtime-secrets.js";
import {
  backupStatus,
  deleteOrphanUploadDir,
  findMissingMedia,
  findOrphanUploadDirs,
  hostResources,
  storageSummary,
} from "../admin/storage.js";
import { db } from "../db/index.js";
import {
  collectionEntries,
  identifyDailyUsage,
  observations,
  passwordResetTokens,
  rarityCache,
  sharedCollectionCredits,
  tripMembers,
  trips,
  users,
  volumeProgress,
} from "../db/schema.js";
import { env } from "../env.js";
import { apiError } from "../errors.js";
import { identifyRoutingSnapshot } from "../identify/routing.js";
import { enqueueIdentify } from "../jobs/identify.js";
import { identifyQueueSize } from "../jobs/identify-queue.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { adminUsers } from "../db/schema.js";
import {
  repairCollectionAfterObservationDeleted,
  upsertCollectionFromObservation,
} from "../services/collection.js";
import { removeObservationFiles } from "../services/observationFiles.js";
import { getIdentifyQuota, utcDayKey } from "../services/identify-quota.js";
import { computeSettle } from "../settle/rules.js";
import {
  deleteRarityCacheKey,
  getRarityCacheEntry,
  listRarityCache,
  rescoreRarityCache,
} from "../admin/rarity-cache.js";

applyRuntimeSecrets();

export const adminRoutes = new Hono<{ Variables: AdminVariables }>();

function iso(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

function fileUrl(obsId: string, filename: string) {
  return `/api/admin/files/${obsId}/${filename}`;
}

function serializeObsAdmin(
  row: typeof observations.$inferSelect,
  owner?: { email: string; displayName: string | null } | null,
) {
  const displayName = row.displayPath.split(/[/\\]/).pop() ?? "display.jpg";
  const originalName = row.originalPath
    ? (row.originalPath.split(/[/\\]/).pop() ?? null)
    : null;
  return {
    id: row.id,
    tripId: row.tripId,
    userId: row.userId,
    userEmail: owner?.email ?? null,
    userDisplayName: owner?.displayName ?? null,
    status: row.status,
    description: row.description,
    capturedAt: iso(row.capturedAt),
    lat: row.lat,
    lng: row.lng,
    displayUrl: fileUrl(row.id, displayName),
    originalUrl: originalName ? fileUrl(row.id, originalName) : null,
    locationLabel: row.locationLabel,
    commonName: row.commonName,
    scientificName: row.scientificName,
    finestReliableRank: row.finestReliableRank,
    confidence: row.confidence,
    taxonomyJson: row.taxonomyJson,
    blurb: row.blurb,
    notes: row.notes,
    error: row.error,
    settleTier: row.settleTier,
    rarity: row.rarity,
    countryCode: row.countryCode,
    countrySource: row.countrySource,
    locationPrecise: row.locationPrecise,
    alertIntroduced: row.alertIntroduced,
    taxonKey: row.taxonKey,
    identifyProvider: row.identifyProvider,
    settledAt: iso(row.settledAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function attachOwners(rows: Array<typeof observations.$inferSelect>) {
  const ids = [...new Set(rows.map((r) => r.userId))];
  const map = new Map<string, { email: string; displayName: string | null }>();
  if (ids.length) {
    const owners = await db.query.users.findMany({
      where: inArray(users.id, ids),
      columns: { id: true, email: true, displayName: true },
    });
    for (const u of owners) map.set(u.id, { email: u.email, displayName: u.displayName });
  }
  return rows.map((r) => serializeObsAdmin(r, map.get(r.userId) ?? null));
}

adminRoutes.post("/login", async (c) => {
  const body = z
    .object({
      username: z.string().trim().min(1).max(64),
      password: z.string().min(1).max(200),
    })
    .parse(await c.req.json());

  const admin = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.username, body.username),
  });
  if (!admin || !(await verifyPassword(body.password, admin.passwordHash))) {
    return c.json({ error: t("admin.invalidCredentials"), code: "invalid_credentials" }, 401);
  }
  setAdminSessionCookie(c, admin.id);
  await writeAudit({
    admin,
    action: "admin.login",
    summary: "login ok",
  });
  return c.json({
    admin: { id: admin.id, username: admin.username, createdAt: iso(admin.createdAt) },
  });
});

adminRoutes.post("/logout", async (c) => {
  clearAdminSessionCookie(c);
  return c.json({ ok: true });
});

adminRoutes.get("/me", requireAdmin, async (c) => {
  const admin = c.get("admin");
  return c.json({
    admin: { id: admin.id, username: admin.username, createdAt: iso(admin.createdAt) },
  });
});

adminRoutes.use("*", requireAdmin);
adminRoutes.get("/dashboard", async (c) => {
  const userCount = await db.select({ n: count() }).from(users);
  const startOfUtcDay = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  const todayUsers = await db
    .select({ n: count() })
    .from(users)
    .where(sql`${users.createdAt} >= ${startOfUtcDay}`);

  const statusRows = await db
    .select({ status: observations.status, n: count() })
    .from(observations)
    .groupBy(observations.status);
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = r.n;

  const day = utcDayKey();
  const usageSum = await db
    .select({ total: sql<number>`coalesce(sum(${identifyDailyUsage.count}), 0)` })
    .from(identifyDailyUsage)
    .where(eq(identifyDailyUsage.day, day));

  const recentFailed = await db.query.observations.findMany({
    where: eq(observations.status, "failed"),
    orderBy: [desc(observations.updatedAt)],
    limit: 8,
  });

  const storage = await storageSummary();
  const identifyRoute = await identifyRoutingSnapshot();

  return c.json({
    users: { total: userCount[0]?.n ?? 0, today: todayUsers[0]?.n ?? 0 },
    observationsByStatus: byStatus,
    identifyQueue: identifyQueueSize(),
    identifyUsageToday: Number(usageSum[0]?.total ?? 0),
    identifyDailyLimit: env.identifyDailyLimit,
    identifyRoute,
    providers: {
      gemini: identifyRoute.gemini,
      zhipu: identifyRoute.zhipu,
    },
    flags: {
      devAuth: env.devAuth,
      identifyMock: env.identifyMock,
      gbifEnabled: env.gbifEnabled,
      sessionSecretIsDefault: env.sessionSecret === "dev-change-me-to-a-long-random-string",
    },
    storage,
    recentFailed: await attachOwners(recentFailed),
    rarityCacheCount: (await db.select({ n: count() }).from(rarityCache))[0]?.n ?? 0,
  });
});

adminRoutes.get("/audit", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const rows = await listAudit(limit);
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      adminId: r.adminId,
      adminUsername: r.adminUsername,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      summary: r.summary,
      ok: r.ok,
      createdAt: iso(r.createdAt),
    })),
  });
});

adminRoutes.get("/users", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const rows = q
    ? await db.query.users.findMany({
        where: like(users.email, `%${q.replace(/[%_]/g, "")}%`),
        orderBy: [desc(users.createdAt)],
        limit,
      })
    : await db.query.users.findMany({ orderBy: [desc(users.createdAt)], limit });

  const day = utcDayKey();
  const items = await Promise.all(
    rows.map(async (u) => {
      const usage = await db.query.identifyDailyUsage.findFirst({
        where: and(eq(identifyDailyUsage.userId, u.id), eq(identifyDailyUsage.day, day)),
      });
      return {
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        createdAt: iso(u.createdAt),
        identifyUseOwnKey: Boolean(u.identifyUseOwnKey),
        identifyUsageToday: usage?.count ?? 0,
      };
    }),
  );
  return c.json({ items });
});

adminRoutes.get("/users/:id", async (c) => {
  const u = await db.query.users.findFirst({ where: eq(users.id, c.req.param("id")) });
  if (!u) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  const tripRows = await db.query.trips.findMany({
    where: eq(trips.userId, u.id),
    orderBy: [desc(trips.createdAt)],
  });
  const obsCount = await db
    .select({ status: observations.status, n: count() })
    .from(observations)
    .where(eq(observations.userId, u.id))
    .groupBy(observations.status);
  const collectionCount = await db
    .select({ n: count() })
    .from(collectionEntries)
    .where(eq(collectionEntries.userId, u.id));
  const quota = await getIdentifyQuota(u.id);

  return c.json({
    user: {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      createdAt: iso(u.createdAt),
      identifyUseOwnKey: Boolean(u.identifyUseOwnKey),
      identifyUserKeyHint: u.identifyUserKeyHint,
      identifyUserBaseUrl: u.identifyUserBaseUrl,
      identifyUserModel: u.identifyUserModel,
    },
    trips: tripRows.map((tr) => ({
      id: tr.id,
      title: tr.title,
      createdAt: iso(tr.createdAt),
    })),
    observationsByStatus: Object.fromEntries(obsCount.map((r) => [r.status, r.n])),
    collectionCount: collectionCount[0]?.n ?? 0,
    identifyQuota: quota,
  });
});

adminRoutes.post("/users/:id/reset-password", async (c) => {
  const admin = c.get("admin");
  const body = z
    .object({ password: z.string().min(8).max(200) })
    .parse(await c.req.json());
  const u = await db.query.users.findFirst({ where: eq(users.id, c.req.param("id")) });
  if (!u) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(body.password) })
    .where(eq(users.id, u.id));
  await writeAudit({
    admin,
    action: "user.reset_password",
    targetType: "user",
    targetId: u.id,
    summary: u.email,
  });
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/clear-byok", async (c) => {
  const admin = c.get("admin");
  const u = await db.query.users.findFirst({ where: eq(users.id, c.req.param("id")) });
  if (!u) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  await db
    .update(users)
    .set({
      identifyUseOwnKey: false,
      identifyUserKeyEnc: null,
      identifyUserKeyHint: null,
      identifyUserBaseUrl: null,
      identifyUserModel: null,
    })
    .where(eq(users.id, u.id));
  await writeAudit({
    admin,
    action: "user.clear_byok",
    targetType: "user",
    targetId: u.id,
    summary: u.email,
  });
  return c.json({ ok: true });
});

adminRoutes.patch("/users/:id/identify-usage", async (c) => {
  const admin = c.get("admin");
  const body = z.object({ count: z.number().int().min(0).max(1_000_000) }).parse(await c.req.json());
  const u = await db.query.users.findFirst({ where: eq(users.id, c.req.param("id")) });
  if (!u) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  const day = utcDayKey();
  const existing = await db.query.identifyDailyUsage.findFirst({
    where: and(eq(identifyDailyUsage.userId, u.id), eq(identifyDailyUsage.day, day)),
  });
  if (existing) {
    await db
      .update(identifyDailyUsage)
      .set({ count: body.count })
      .where(and(eq(identifyDailyUsage.userId, u.id), eq(identifyDailyUsage.day, day)));
  } else {
    await db.insert(identifyDailyUsage).values({ userId: u.id, day, count: body.count });
  }
  await writeAudit({
    admin,
    action: "user.set_identify_usage",
    targetType: "user",
    targetId: u.id,
    summary: `${u.email} day=${day} count=${body.count}`,
  });
  return c.json({ ok: true, identifyQuota: await getIdentifyQuota(u.id) });
});

adminRoutes.delete("/users/:id", async (c) => {
  const admin = c.get("admin");
  const u = await db.query.users.findFirst({ where: eq(users.id, c.req.param("id")) });
  if (!u) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }

  const ownedObs = await db.query.observations.findMany({
    where: eq(observations.userId, u.id),
  });
  for (const row of ownedObs) {
    await db.delete(sharedCollectionCredits).where(eq(sharedCollectionCredits.observationId, row.id));
    await db.delete(observations).where(eq(observations.id, row.id));
    await removeObservationFiles(row.displayPath);
  }

  const ownedTrips = await db.query.trips.findMany({ where: eq(trips.userId, u.id) });
  for (const tr of ownedTrips) {
    // Remaining observations on trips owned by user but uploaded by others — reclaim files if any left
    const leftover = await db.query.observations.findMany({ where: eq(observations.tripId, tr.id) });
    for (const row of leftover) {
      await db.delete(sharedCollectionCredits).where(eq(sharedCollectionCredits.observationId, row.id));
      await db.delete(observations).where(eq(observations.id, row.id));
      await removeObservationFiles(row.displayPath);
      await repairCollectionAfterObservationDeleted(row.userId, row.id, row.taxonKey);
    }
    await db.delete(tripMembers).where(eq(tripMembers.tripId, tr.id));
    await db.delete(trips).where(eq(trips.id, tr.id));
  }

  await db.delete(tripMembers).where(eq(tripMembers.userId, u.id));
  await db.delete(sharedCollectionCredits).where(eq(sharedCollectionCredits.userId, u.id));
  await db.delete(collectionEntries).where(eq(collectionEntries.userId, u.id));
  await db.delete(volumeProgress).where(eq(volumeProgress.userId, u.id));
  await db.delete(identifyDailyUsage).where(eq(identifyDailyUsage.userId, u.id));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, u.email));
  await db.delete(users).where(eq(users.id, u.id));

  await writeAudit({
    admin,
    action: "user.delete",
    targetType: "user",
    targetId: u.id,
    summary: u.email,
  });
  return c.json({ ok: true });
});

adminRoutes.get("/observations", async (c) => {
  const status = c.req.query("status");
  const userId = c.req.query("userId");
  const email = (c.req.query("email") ?? "").trim();
  const hasError = c.req.query("hasError");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);

  let userFilterId = userId ?? null;
  if (email) {
    const u = await db.query.users.findFirst({ where: eq(users.email, email) });
    userFilterId = u?.id ?? "__none__";
  }

  const conditions = [];
  if (status === "analyzing" || status === "pending_settle" || status === "settled" || status === "failed") {
    conditions.push(eq(observations.status, status));
  }
  if (userFilterId) conditions.push(eq(observations.userId, userFilterId));
  if (hasError === "1") {
    conditions.push(sql`${observations.error} IS NOT NULL AND ${observations.error} != ''`);
  }

  const rows =
    conditions.length > 0
      ? await db.query.observations.findMany({
          where: and(...conditions),
          orderBy: [desc(observations.updatedAt)],
          limit,
        })
      : await db.query.observations.findMany({
          orderBy: [desc(observations.updatedAt)],
          limit,
        });

  return c.json({ items: await attachOwners(rows) });
});

adminRoutes.get("/observations/:id", async (c) => {
  const row = await db.query.observations.findFirst({
    where: eq(observations.id, c.req.param("id")),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  const owner = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
  return c.json({
    observation: serializeObsAdmin(
      row,
      owner ? { email: owner.email, displayName: owner.displayName } : null,
    ),
    user: owner
      ? { id: owner.id, email: owner.email, displayName: owner.displayName }
      : null,
  });
});

adminRoutes.post("/observations/:id/requeue", async (c) => {
  const admin = c.get("admin");
  const row = await db.query.observations.findFirst({
    where: eq(observations.id, c.req.param("id")),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  if (row.status !== "analyzing" && row.status !== "failed") {
    return c.json({ error: t("admin.requeueBadStatus"), code: "bad_status" }, 400);
  }
  const now = new Date();
  await db
    .update(observations)
    .set({ status: "analyzing", error: null, updatedAt: now })
    .where(eq(observations.id, row.id));
  enqueueIdentify({
    observationId: row.id,
    imagePath: join(env.uploadDir, row.displayPath),
    mimeType: "image/jpeg",
    lat: row.lat,
    lng: row.lng,
    capturedAt: row.capturedAt,
    description: row.description,
  });
  await writeAudit({
    admin,
    action: "observation.requeue",
    targetType: "observation",
    targetId: row.id,
  });
  return c.json({ ok: true });
});

adminRoutes.post("/observations/:id/reidentify", async (c) => {
  const admin = c.get("admin");
  const body = z
    .object({ description: z.string().trim().min(1).max(2000) })
    .parse(await c.req.json());
  const row = await db.query.observations.findFirst({
    where: eq(observations.id, c.req.param("id")),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }

  await repairCollectionAfterObservationDeleted(row.userId, row.id, row.taxonKey);
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
      identifyProvider: null,
      settledAt: null,
      updatedAt: now,
    })
    .where(eq(observations.id, row.id));

  enqueueIdentify({
    observationId: row.id,
    imagePath: join(env.uploadDir, row.displayPath),
    mimeType: "image/jpeg",
    lat: row.lat,
    lng: row.lng,
    capturedAt: row.capturedAt,
    description: body.description,
  });

  await writeAudit({
    admin,
    action: "observation.reidentify",
    targetType: "observation",
    targetId: row.id,
    summary: body.description.slice(0, 120),
  });
  return c.json({ ok: true });
});

adminRoutes.post("/observations/:id/recompute-settle", async (c) => {
  const admin = c.get("admin");
  const row = await db.query.observations.findFirst({
    where: eq(observations.id, c.req.param("id")),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  if (!row.scientificName && !row.taxonomyJson) {
    return c.json({ error: t("admin.recomputeNoIdentity"), code: "no_identity" }, 400);
  }

  const derived = await computeSettle({
    lat: row.lat,
    lng: row.lng,
    finestReliableRank: row.finestReliableRank,
    scientificName: row.scientificName,
    commonName: row.commonName,
    taxonomyJson: row.taxonomyJson,
  });
  const now = new Date();
  await db
    .update(observations)
    .set({
      countryCode: derived.countryCode,
      countrySource: derived.countrySource,
      locationLabel: derived.locationLabel,
      locationPrecise: derived.locationPrecise,
      alertIntroduced: derived.alertIntroduced,
      rarity: derived.rarity,
      settleTier: derived.settleTier,
      taxonKey: derived.taxonKey,
      updatedAt: now,
    })
    .where(eq(observations.id, row.id));

  const updated = await db.query.observations.findFirst({ where: eq(observations.id, row.id) });
  if (updated?.status === "settled") {
    await upsertCollectionFromObservation(updated);
  }

  await writeAudit({
    admin,
    action: "observation.recompute_settle",
    targetType: "observation",
    targetId: row.id,
    summary: `rarity=${derived.rarity} introduced=${derived.alertIntroduced}`,
  });
  return c.json({ observation: serializeObsAdmin(updated!) });
});

adminRoutes.delete("/observations/:id", async (c) => {
  const admin = c.get("admin");
  const row = await db.query.observations.findFirst({
    where: eq(observations.id, c.req.param("id")),
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  await db.delete(sharedCollectionCredits).where(eq(sharedCollectionCredits.observationId, row.id));
  await db.delete(observations).where(eq(observations.id, row.id));
  await removeObservationFiles(row.displayPath);
  await repairCollectionAfterObservationDeleted(row.userId, row.id, row.taxonKey);
  await writeAudit({
    admin,
    action: "observation.delete",
    targetType: "observation",
    targetId: row.id,
  });
  return c.json({ ok: true });
});

adminRoutes.get("/files/:observationId/:filename", async (c) => {
  const obsId = c.req.param("observationId");
  const filename = c.req.param("filename");
  const row = await db.query.observations.findFirst({
    where: eq(observations.id, obsId),
    columns: { id: true },
  });
  if (!row) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  const rel = `${obsId}/${filename}`;
  if (rel.includes("..")) {
    return c.json({ error: t("error.invalidPath"), code: "invalid_path" }, 400);
  }
  const absolute = normalize(join(env.uploadDir, rel));
  const root = normalize(env.uploadDir + sep);
  if (!absolute.startsWith(root)) {
    return c.json({ error: t("error.invalidPath"), code: "invalid_path" }, 400);
  }
  try {
    await access(absolute);
  } catch {
    return c.json({ error: t("error.notFound"), code: "not_found" }, 404);
  }
  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
});

adminRoutes.get("/secrets", async (c) => c.json(secretsPublicView()));

adminRoutes.patch("/secrets", async (c) => {
  const admin = c.get("admin");
  const body = z
    .object({
      id: z.string().min(1),
      value: z.union([z.string(), z.number(), z.null()]),
    })
    .parse(await c.req.json());

  try {
    patchRuntimeSecretSlot(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("unknown_secret_slot")) {
      return c.json({ error: t("admin.secrets.unknownSlot"), code: "unknown_slot" }, 400);
    }
    if (msg === "invalid_number") {
      return c.json({ error: t("admin.secrets.invalidNumber"), code: "invalid_number" }, 400);
    }
    throw e;
  }

  await writeAudit({
    admin,
    action: "secrets.patch",
    targetType: "secret_slot",
    targetId: body.id,
    summary: body.value === null || body.value === "" ? "clear" : "set",
  });
  return c.json(secretsPublicView());
});

adminRoutes.get("/storage", async (c) => {
  const [summary, orphans, missing, backup, host] = await Promise.all([
    storageSummary(),
    findOrphanUploadDirs(),
    findMissingMedia(),
    backupStatus(),
    hostResources(),
  ]);
  return c.json({ ...summary, orphans, missing, backup, host });
});

adminRoutes.post("/storage/orphans/delete", async (c) => {
  const admin = c.get("admin");
  const body = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }).parse(await c.req.json());
  // Only delete ids that are still orphans right now (intersect with live scan).
  const live = new Set((await findOrphanUploadDirs()).map((o) => o.id));
  const deleted: string[] = [];
  const skipped: string[] = [];
  for (const id of body.ids) {
    if (!live.has(id)) {
      skipped.push(id);
      continue;
    }
    if (await deleteOrphanUploadDir(id)) deleted.push(id);
    else skipped.push(id);
  }
  await writeAudit({
    admin,
    action: "storage.delete_orphans",
    summary: `deleted=${deleted.length} skipped=${skipped.length}`,
  });
  return c.json({ deleted, skipped });
});

adminRoutes.get("/rarity-cache", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  return c.json(await listRarityCache({ q: q || undefined, limit, offset }));
});

adminRoutes.get("/rarity-cache/entry", async (c) => {
  const key = (c.req.query("key") ?? "").trim();
  if (!key) return c.json({ error: t("admin.rarityCache.needKey"), code: "need_key" }, 400);
  const entry = await getRarityCacheEntry(key);
  if (!entry) {
    const err = apiError("not found", 404);
    return c.json(err.body, err.status);
  }
  return c.json(entry);
});

adminRoutes.post("/rarity-cache/delete", async (c) => {
  const admin = c.get("admin");
  const body = z.object({ key: z.string().trim().min(1) }).parse(await c.req.json());
  const removed = await deleteRarityCacheKey(body.key);
  await writeAudit({
    admin,
    action: "rarity_cache.delete",
    targetType: "rarity_cache",
    targetId: body.key,
    summary: `removed=${removed}`,
  });
  return c.json({ ok: true, removed });
});

adminRoutes.post("/rarity-cache/rescore", async (c) => {
  const admin = c.get("admin");
  const body = z.object({ key: z.string().trim().min(1) }).parse(await c.req.json());
  const result = await rescoreRarityCache(body.key);
  if ("error" in result && result.error === "bad_key") {
    return c.json({ error: t("admin.rarityCache.badKey"), code: "bad_key" }, 400);
  }
  if ("error" in result && result.error === "encounter_failed") {
    await writeAudit({
      admin,
      action: "rarity_cache.rescore",
      targetType: "rarity_cache",
      targetId: body.key,
      summary: `failed source=${result.source}`,
      ok: false,
    });
    return c.json(
      {
        error: t("admin.rarityCache.rescoreFailed"),
        code: "encounter_failed",
        previousRarity: result.previousRarity,
        source: result.source,
      },
      502,
    );
  }
  if ("error" in result) {
    return c.json({ error: t("admin.rarityCache.rescoreFailed"), code: result.error }, 400);
  }
  await writeAudit({
    admin,
    action: "rarity_cache.rescore",
    targetType: "rarity_cache",
    targetId: body.key,
    summary: `${result.previousRarity ?? "?"}→${result.rarity} obs=${result.observationsUpdated}`,
  });
  return c.json({ ok: true, ...result });
});

adminRoutes.post("/rarity-cache/clear", async (c) => {
  const admin = c.get("admin");
  const body = z
    .object({
      all: z.boolean().optional(),
      prefix: z.string().optional(),
    })
    .parse((await c.req.json().catch(() => ({}))) as unknown);

  let removed = 0;
  if (body.all) {
    const r = await db.delete(rarityCache);
    removed = r.rowsAffected ?? 0;
  } else if (body.prefix?.trim()) {
    const r = await db
      .delete(rarityCache)
      .where(like(rarityCache.cacheKey, `${body.prefix.trim().replace(/[%_]/g, "")}%`));
    removed = r.rowsAffected ?? 0;
  } else {
    return c.json({ error: t("admin.rarityClearNeedArg"), code: "need_arg" }, 400);
  }

  await writeAudit({
    admin,
    action: "rarity_cache.clear",
    summary: body.all ? "all" : `prefix=${body.prefix}`,
  });
  return c.json({ ok: true, removed });
});
