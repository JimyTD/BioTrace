import { readdir, stat, rm, access, lstat } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { observations } from "../db/schema.js";

/** Observation ids are UUIDs; ignore other names under uploads (e.g. .gitkeep). */
const OBS_DIR_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uploadsRoot(): string {
  return normalize(env.uploadDir + sep);
}

/** Resolve path under uploadDir; reject traversal / escape. */
function safeUploadChild(name: string): string | null {
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\") || name.includes("\0")) {
    return null;
  }
  if (!OBS_DIR_RE.test(name)) return null;
  const absolute = normalize(join(env.uploadDir, name));
  if (!absolute.startsWith(uploadsRoot())) return null;
  return absolute;
}

async function dirSize(path: string): Promise<number> {
  try {
    const st = await stat(path);
    if (st.isFile()) return st.size;
    if (!st.isDirectory()) return 0;
  } catch {
    return 0;
  }
  const entries = await readdir(path, { withFileTypes: true });
  let total = 0;
  for (const e of entries) {
    total += await dirSize(join(path, e.name));
  }
  return total;
}

export async function storageSummary() {
  let dbBytes = 0;
  try {
    dbBytes = (await stat(env.databasePath)).size;
  } catch {
    dbBytes = 0;
  }
  const uploadsBytes = await dirSize(env.uploadDir);
  return {
    databasePath: env.databasePath,
    databaseBytes: dbBytes,
    uploadDir: env.uploadDir,
    uploadsBytes,
  };
}

export type OrphanDir = {
  id: string;
  bytes: number;
};

/**
 * Orphan = directory named like an observation UUID under uploads/,
 * with no matching observations.id row.
 * Skips files, symlinks, and non-UUID names.
 */
export async function findOrphanUploadDirs(): Promise<OrphanDir[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(env.uploadDir);
  } catch {
    return [];
  }
  const orphans: OrphanDir[] = [];
  for (const name of entries) {
    const abs = safeUploadChild(name);
    if (!abs) continue;
    try {
      const st = await lstat(abs);
      if (!st.isDirectory() || st.isSymbolicLink()) continue;
    } catch {
      continue;
    }
    const row = await db.query.observations.findFirst({
      where: eq(observations.id, name),
      columns: { id: true },
    });
    if (row) continue;
    orphans.push({ id: name, bytes: await dirSize(abs) });
  }
  return orphans;
}

/**
 * Delete one orphan dir. Re-checks DB + path safety immediately before rm.
 * Never deletes a directory that still has an observation row.
 */
export async function deleteOrphanUploadDir(obsId: string): Promise<boolean> {
  const abs = safeUploadChild(obsId);
  if (!abs) return false;

  const row = await db.query.observations.findFirst({
    where: eq(observations.id, obsId),
    columns: { id: true },
  });
  if (row) return false;

  try {
    const st = await lstat(abs);
    if (!st.isDirectory() || st.isSymbolicLink()) return false;
  } catch {
    return false;
  }

  // Final containment check after lstat
  const normalized = normalize(abs);
  if (!normalized.startsWith(uploadsRoot())) return false;

  await rm(normalized, { recursive: true, force: false });
  return true;
}

export type MissingMediaRow = {
  id: string;
  displayPath: string;
  originalPath: string | null;
  /** 展示图（display.jpg）是否缺失 */
  displayMissing: boolean;
  /** 原图是否缺失（仅当库里有 originalPath 时有意义） */
  originalMissing: boolean;
};

/**
 * Observation rows whose expected files are gone on disk.
 * Does not delete DB rows — diagnostic only.
 */
export async function findMissingMedia(): Promise<MissingMediaRow[]> {
  const rows = await db.query.observations.findMany({
    columns: { id: true, displayPath: true, originalPath: true },
  });
  const missing: MissingMediaRow[] = [];
  for (const row of rows) {
    let displayMissing = false;
    let originalMissing = false;
    try {
      await access(join(env.uploadDir, row.displayPath));
    } catch {
      displayMissing = true;
    }
    if (row.originalPath) {
      try {
        await access(join(env.uploadDir, row.originalPath));
      } catch {
        originalMissing = true;
      }
    }
    if (displayMissing || originalMissing) {
      missing.push({
        id: row.id,
        displayPath: row.displayPath,
        originalPath: row.originalPath,
        displayMissing,
        originalMissing,
      });
    }
  }
  return missing;
}

/** Optional: scan fixed backup dir if BIOTRACE_BACKUP_DIR set; else null. */
export async function backupStatus() {
  const dir = (process.env.BIOTRACE_BACKUP_DIR ?? "").trim();
  if (!dir) return { configured: false as const, dir: null, latest: null };
  try {
    const names = await readdir(dir);
    let latest: { name: string; bytes: number; mtimeMs: number } | null = null;
    for (const name of names) {
      if (!name.includes("biotrace") && !name.endsWith(".tgz") && !name.endsWith(".tar.gz")) {
        continue;
      }
      try {
        const st = await stat(join(dir, name));
        if (!st.isFile()) continue;
        if (!latest || st.mtimeMs > latest.mtimeMs) {
          latest = { name, bytes: st.size, mtimeMs: st.mtimeMs };
        }
      } catch {
        /* skip */
      }
    }
    return { configured: true as const, dir, latest };
  } catch {
    return { configured: true as const, dir, latest: null };
  }
}
