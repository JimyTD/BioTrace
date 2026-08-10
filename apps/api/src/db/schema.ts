import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const observations = sqliteTable("observations", {
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
  displayPath: text("display_path").notNull(),
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
  locationPrecise: integer("location_precise", { mode: "boolean" }),
  alertIntroduced: integer("alert_introduced", { mode: "boolean" }),
  taxonKey: text("taxon_key"),
  /** Identify provider id: gemini | zhipu */
  identifyProvider: text("identify_provider"),
  settledAt: integer("settled_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

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

/** On-demand GBIF / seed rarity lookups keyed by country|taxon. */
export const rarityCache = sqliteTable("rarity_cache", {
  cacheKey: text("cache_key").primaryKey(),
  rarity: text("rarity").notNull(),
  occurrenceCount: integer("occurrence_count"),
  gbifUsageKey: integer("gbif_usage_key"),
  source: text("source").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

/** One-time email magic-link tokens (store hash only). */
export const loginTokens = sqliteTable("login_tokens", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type Observation = typeof observations.$inferSelect;
export type CollectionEntry = typeof collectionEntries.$inferSelect;
export type RarityCacheRow = typeof rarityCache.$inferSelect;
export type LoginToken = typeof loginTokens.$inferSelect;
