import { sqliteTable, text, integer, real, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  /** Explicit switch: use saved OpenAI-compatible key instead of platform. */
  identifyUseOwnKey: integer("identify_use_own_key", { mode: "boolean" }),
  /** AES-GCM sealed API key (`secret-box`). */
  identifyUserKeyEnc: text("identify_user_key_enc"),
  identifyUserKeyHint: text("identify_user_key_hint"),
  identifyUserBaseUrl: text("identify_user_base_url"),
  identifyUserModel: text("identify_user_model"),
});

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  /** Admin user id (succession on admin leave). */
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  /**
   * 开：展示优先用手填时间/地点（空项仍回落自动聚合）。
   * 关：只展示自动聚合；手填内容保留不丢。
   */
  metaManualEnabled: integer("meta_manual_enabled", { mode: "boolean" }),
  /** 用户手填时间文案（自由文本，如「2026.7」）。 */
  manualDateText: text("manual_date_text"),
  /** 用户手填地点文案（自由文本）。 */
  manualPlaceText: text("manual_place_text"),
  /** Unique invite code (generated once; not rotated). */
  inviteCode: text("invite_code").unique(),
  /** Admin toggle: whether the invite code accepts new members. */
  allowJoin: integer("allow_join", { mode: "boolean" }),
});

/** Members of a trip (including admin). */
export const tripMembers = sqliteTable(
  "trip_members",
  {
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.userId] })],
);

export const observations = sqliteTable(
  "observations",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", {
      enum: ["analyzing", "pending_settle", "settled", "failed"],
    }).notNull(),
    description: text("description"),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }),
    lat: real("lat"),
    lng: real("lng"),
    /** SHA-256 hex of original upload bytes; unique per user for exact-duplicate reject. */
    contentHash: text("content_hash"),
    displayPath: text("display_path").notNull(),
    /** Original upload relative path (album quality); may be null for legacy rows. */
    originalPath: text("original_path"),
    /** Human place label from Tianditu reverse geocode (e.g. 省市区). */
    locationLabel: text("location_label"),
    commonName: text("common_name"),
    scientificName: text("scientific_name"),
    finestReliableRank: text("finest_reliable_rank"),
    confidence: real("confidence"),
    taxonomyJson: text("taxonomy_json"),
    blurb: text("blurb"),
    notes: text("notes"),
    error: text("error"),
    settleTier: text("settle_tier", { enum: ["full", "weak", "none"] }),
    /** Tier code from rarity module (default N/R/SR/UR; not hard-capped to four). */
    rarity: text("rarity"),
    countryCode: text("country_code"),
    /**
     * 国别判定来源，仅用于诊断与日后定向重跑，不参与业务逻辑。
     * `tianditu` 线上权威| `offline` 离线国界兜底 | `none` 判定执行过但坐标缺失/非法
     * | `null` 尚未判定（刚上传，或在识别闸门就被拦下）
     */
    countrySource: text("country_source"),
    locationPrecise: integer("location_precise", { mode: "boolean" }),
    alertIntroduced: integer("alert_introduced", { mode: "boolean" }),
    taxonKey: text("taxon_key"),
    /** Identify provider id: gemini | zhipu */
    identifyProvider: text("identify_provider"),
    settledAt: integer("settled_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("observations_user_content_hash").on(t.userId, t.contentHash)],
);

/**
 * Tracks图鉴 credit from a shared-trip observation so leave/kick can fully reclaim.
 * Own-upload solo progress does not need a row here.
 */
export const sharedCollectionCredits = sqliteTable(
  "shared_collection_credits",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    observationId: text("observation_id")
      .notNull()
      .references(() => observations.id),
    taxonKey: text("taxon_key").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.observationId] })],
);

export const collectionEntries = sqliteTable(
  "collection_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    taxonKey: text("taxon_key").notNull(),
    commonName: text("common_name"),
    scientificName: text("scientific_name"),
    rarity: text("rarity").notNull(),
    coverObservationId: text("cover_observation_id"),
    firstCollectedAt: integer("first_collected_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("collection_user_taxon").on(t.userId, t.taxonKey)],
);

/** Encounter rarity keyed by encVer|country|taxon. Permanent until admin delete or version bump. */
export const rarityCache = sqliteTable("rarity_cache", {
  cacheKey: text("cache_key").primaryKey(),
  rarity: text("rarity").notNull(),
  occurrenceCount: integer("occurrence_count"),
  gbifUsageKey: integer("gbif_usage_key"),
  source: text("source").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

/** One-time password-reset OTP tokens (store hash only). */
export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Platform-key identify calls per user per UTC calendar day. */
export const identifyDailyUsage = sqliteTable(
  "identify_daily_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** UTC calendar day `YYYY-MM-DD`. */
    day: text("day").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** User progress on configurable field volumes (套册). */
export const volumeProgress = sqliteTable(
  "volume_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    volumeId: text("volume_id").notNull(),
    litSlotIdsJson: text("lit_slot_ids_json").notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("volume_progress_user_vol").on(t.userId, t.volumeId)],
);

/** Separate from end-user `users` — admin console only. */
export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const adminAuditLog = sqliteTable("admin_audit_log", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  adminUsername: text("admin_username").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  summary: text("summary"),
  ok: integer("ok", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Platform Gemini / Zhipu identify calls per UTC day. */
export const identifyProviderDaily = sqliteTable(
  "identify_provider_daily",
  {
    provider: text("provider").notNull(),
    day: text("day").notNull(),
    success: integer("success").notNull(),
    fail: integer("fail").notNull(),
    /** First Gemini daily_exhausted this UTC day (ms). */
    exhaustedAt: integer("exhausted_at", { mode: "timestamp_ms" }),
    /** Gemini success count when daily quota first tripped. */
    successAtExhaust: integer("success_at_exhaust"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.day] })],
);

export type User = typeof users.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type TripMember = typeof tripMembers.$inferSelect;
export type SharedCollectionCredit = typeof sharedCollectionCredits.$inferSelect;
export type Observation = typeof observations.$inferSelect;
export type CollectionEntry = typeof collectionEntries.$inferSelect;
export type RarityCacheRow = typeof rarityCache.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type VolumeProgress = typeof volumeProgress.$inferSelect;
export type IdentifyDailyUsage = typeof identifyDailyUsage.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type IdentifyProviderDaily = typeof identifyProviderDaily.$inferSelect;
