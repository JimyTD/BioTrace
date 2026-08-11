import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "../env.js";
import * as schema from "./schema.js";

const client = createClient({ url: env.databaseUrl });

export const db = drizzle(client, { schema });

async function ensureColumn(table: string, name: string, ddl: string) {
  const cols = await client.execute(`PRAGMA table_info(${table})`);
  const names = new Set(cols.rows.map((r) => String(r.name)));
  if (!names.has(name)) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export async function migrate() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL REFERENCES trips(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      description TEXT,
      captured_at INTEGER,
      lat REAL,
      lng REAL,
      display_path TEXT NOT NULL,
      common_name TEXT,
      scientific_name TEXT,
      finest_reliable_rank TEXT,
      confidence REAL,
      taxonomy_json TEXT,
      blurb TEXT,
      notes TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collection_entries (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      taxon_key TEXT NOT NULL,
      common_name TEXT,
      scientific_name TEXT,
      rarity TEXT NOT NULL,
      cover_observation_id TEXT,
      first_collected_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
    CREATE INDEX IF NOT EXISTS idx_obs_trip ON observations(trip_id);
    CREATE INDEX IF NOT EXISTS idx_obs_user ON observations(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS collection_user_taxon ON collection_entries(user_id, taxon_key);
    CREATE TABLE IF NOT EXISTS rarity_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      rarity TEXT NOT NULL,
      occurrence_count INTEGER,
      gbif_usage_key INTEGER,
      source TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_email ON password_reset_tokens(email);
    CREATE TABLE IF NOT EXISTS volume_progress (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      volume_id TEXT NOT NULL,
      lit_slot_ids_json TEXT NOT NULL,
      completed_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS volume_progress_user_vol ON volume_progress(user_id, volume_id);
    CREATE TABLE IF NOT EXISTS identify_daily_usage (
      user_id TEXT NOT NULL REFERENCES users(id),
      day TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (user_id, day)
    );
  `);

  await ensureColumn("observations", "blurb", "blurb TEXT");
  await ensureColumn("observations", "settle_tier", "settle_tier TEXT");
  await ensureColumn("observations", "rarity", "rarity TEXT");
  await ensureColumn("observations", "country_code", "country_code TEXT");
  await ensureColumn("observations", "country_source", "country_source TEXT");
  await ensureColumn("observations", "location_precise", "location_precise INTEGER");
  await ensureColumn("observations", "alert_introduced", "alert_introduced INTEGER");
  await ensureColumn("observations", "taxon_key", "taxon_key TEXT");
  await ensureColumn("observations", "identify_provider", "identify_provider TEXT");
  await ensureColumn("observations", "settled_at", "settled_at INTEGER");
  await ensureColumn("observations", "content_hash", "content_hash TEXT");
  await ensureColumn("observations", "original_path", "original_path TEXT");
  await ensureColumn("observations", "location_label", "location_label TEXT");

  await ensureColumn("trips", "meta_manual_enabled", "meta_manual_enabled INTEGER");
  await ensureColumn("trips", "manual_date_text", "manual_date_text TEXT");
  await ensureColumn("trips", "manual_place_text", "manual_place_text TEXT");

  // SQLite UNIQUE 允许多个 NULL；精确去重只约束已写入 hash 的行。
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS observations_user_content_hash
    ON observations(user_id, content_hash)
  `);

  // Android Photo Picker 涂零 GPS：历史脏数据清成无定位，引导补标。
  await client.execute(`
    UPDATE observations
    SET lat = NULL,
        lng = NULL,
        location_precise = 0,
        location_label = NULL
    WHERE lat IS NOT NULL AND lng IS NOT NULL
      AND ABS(lat) < 0.00001 AND ABS(lng) < 0.00001
  `);

  // Drop cached match-miss defaults so improved GBIF resolver can retry.
  await client.execute(`DELETE FROM rarity_cache WHERE source = 'default'`);

  // One-shot cache invalidation when rarity grading rules bump.
  const ver = await client.execute(`PRAGMA user_version`);
  const userVersion = Number(ver.rows[0]?.user_version ?? 0);
  if (userVersion < 3) {
    await client.execute(`DELETE FROM rarity_cache WHERE source IN ('gbif', 'seed')`);
    await client.execute(`PRAGMA user_version = 3`);
  }

  // Password auth: wipe test-era magic-link users (no migration) and rebuild users table.
  if (userVersion < 4) {
    await client.executeMultiple(`
      DELETE FROM collection_entries;
      DELETE FROM observations;
      DELETE FROM trips;
      DELETE FROM password_reset_tokens;
      DROP TABLE IF EXISTS login_tokens;
      DROP TABLE IF EXISTS users;
      CREATE TABLE users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        created_at INTEGER NOT NULL
      );
      PRAGMA user_version = 4;
    `);
  }

  await ensureColumn("users", "display_name", "display_name TEXT");
  await ensureColumn("users", "identify_use_own_key", "identify_use_own_key INTEGER");
  await ensureColumn("users", "identify_user_key_enc", "identify_user_key_enc TEXT");
  await ensureColumn("users", "identify_user_key_hint", "identify_user_key_hint TEXT");
  await ensureColumn("users", "identify_user_base_url", "identify_user_base_url TEXT");
  await ensureColumn("users", "identify_user_model", "identify_user_model TEXT");

  // Cut 2: grandfather ready → settled
  await client.execute(`
    UPDATE observations
    SET status = 'settled',
        settle_tier = COALESCE(settle_tier, 'full'),
        rarity = COALESCE(rarity, 'N'),
        location_precise = COALESCE(location_precise, CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 1 ELSE 0 END),
        alert_introduced = COALESCE(alert_introduced, 0),
        settled_at = COALESCE(settled_at, updated_at)
    WHERE status = 'ready'
  `);
}
