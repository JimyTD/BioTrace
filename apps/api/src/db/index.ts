import { randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "../env.js";
import * as schema from "./schema.js";

const client = createClient({ url: env.databaseUrl });

export const db = drizzle(client, { schema });

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genInviteCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += INVITE_ALPHABET[bytes[i]! % INVITE_ALPHABET.length]!;
  }
  return out;
}

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
      created_at INTEGER NOT NULL,
      invite_code TEXT UNIQUE,
      allow_join INTEGER
    );
    CREATE TABLE IF NOT EXISTS trip_members (
      trip_id TEXT NOT NULL REFERENCES trips(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (trip_id, user_id)
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
      source TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      score REAL,
      items_json TEXT,
      adjustments_json TEXT,
      model TEXT,
      samples INTEGER,
      list_level TEXT,
      reasons_json TEXT
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
  await ensureColumn("observations", "accepted_taxonomy_json", "accepted_taxonomy_json TEXT");
  await ensureColumn("observations", "identify_provider", "identify_provider TEXT");
  await ensureColumn("observations", "settled_at", "settled_at INTEGER");
  await ensureColumn("observations", "content_hash", "content_hash TEXT");
  await ensureColumn("observations", "original_path", "original_path TEXT");
  await ensureColumn("observations", "location_label", "location_label TEXT");

  // 稀有度量表的判据列：查得出某行是哪档模型按哪些答案判的，老库补齐。
  await ensureColumn("rarity_cache", "score", "score REAL");
  await ensureColumn("rarity_cache", "items_json", "items_json TEXT");
  await ensureColumn("rarity_cache", "adjustments_json", "adjustments_json TEXT");
  await ensureColumn("rarity_cache", "model", "model TEXT");
  await ensureColumn("rarity_cache", "samples", "samples INTEGER");
  await ensureColumn("rarity_cache", "list_level", "list_level TEXT");
  await ensureColumn("rarity_cache", "reasons_json", "reasons_json TEXT");
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_rarity_cache_model ON rarity_cache(model)`,
  );

  await ensureColumn("trips", "meta_manual_enabled", "meta_manual_enabled INTEGER");
  await ensureColumn("trips", "manual_date_text", "manual_date_text TEXT");
  await ensureColumn("trips", "manual_place_text", "manual_place_text TEXT");
  await ensureColumn("trips", "invite_code", "invite_code TEXT");
  await ensureColumn("trips", "allow_join", "allow_join INTEGER");

  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS trips_invite_code_uq ON trips(invite_code)
  `);
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS trip_members (
      trip_id TEXT NOT NULL REFERENCES trips(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (trip_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS shared_collection_credits (
      user_id TEXT NOT NULL REFERENCES users(id),
      trip_id TEXT NOT NULL REFERENCES trips(id),
      observation_id TEXT NOT NULL REFERENCES observations(id),
      taxon_key TEXT NOT NULL,
      PRIMARY KEY (user_id, observation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_credits_trip_user
      ON shared_collection_credits(trip_id, user_id);
  `);

  // Backfill: every legacy trip owner becomes a member; ensure invite code exists.
  await client.execute(`
    INSERT OR IGNORE INTO trip_members (trip_id, user_id, joined_at)
    SELECT id, user_id, created_at FROM trips
  `);
  const tripsMissingCode = await client.execute(
    `SELECT id FROM trips WHERE invite_code IS NULL OR invite_code = ''`,
  );
  for (const row of tripsMissingCode.rows) {
    const id = String(row.id);
    let code = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      code = genInviteCode();
      try {
        await client.execute({
          sql: `UPDATE trips SET invite_code = ?, allow_join = COALESCE(allow_join, 0) WHERE id = ?`,
          args: [code, id],
        });
        break;
      } catch {
        /* unique collision — retry */
      }
    }
  }

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

  // 量表算法全面取代旧的「频次 + 偏移分」：非 scale 版本的缓存一律作废，
  // 留着只会让新旧两套判据混在一张表里。observations 上的旧档位由后台批量重算刷新。
  await client.execute(`DELETE FROM rarity_cache WHERE cache_key NOT LIKE 'scale%|%'`);

  const ver = await client.execute(`PRAGMA user_version`);
  const userVersion = Number(ver.rows[0]?.user_version ?? 0);

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

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY NOT NULL,
      admin_id TEXT NOT NULL,
      admin_username TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      summary TEXT,
      ok INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at);
    CREATE TABLE IF NOT EXISTS identify_provider_daily (
      provider TEXT NOT NULL,
      day TEXT NOT NULL,
      success INTEGER NOT NULL,
      fail INTEGER NOT NULL,
      exhausted_at INTEGER,
      success_at_exhaust INTEGER,
      PRIMARY KEY (provider, day)
    );
  `);

  await ensureColumn("identify_provider_daily", "exhausted_at", "exhausted_at INTEGER");
  await ensureColumn("identify_provider_daily", "success_at_exhaust", "success_at_exhaust INTEGER");

  await client.execute(`
    INSERT OR IGNORE INTO identify_provider_daily (provider, day, success, fail)
    SELECT identify_provider,
           strftime('%Y-%m-%d', created_at / 1000, 'unixepoch'),
           COUNT(*),
           0
    FROM observations
    WHERE identify_provider IN ('gemini', 'zhipu')
    GROUP BY identify_provider, strftime('%Y-%m-%d', created_at / 1000, 'unixepoch')
  `);
}
