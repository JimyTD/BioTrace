import { readdir, stat, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { observations } from "../db/schema.js";

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

export async function findOrphanUploadDirs(): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(env.uploadDir);
  } catch {
    return [];
  }
  const orphans: string[] = [];
  for (const name of entries) {
    const row = await db.query.observations.findFirst({
      where: eq(observations.id, name),
      columns: { id: true },
    });
    if (!row) orphans.push(name);
  }
  return orphans;
}

export async function deleteOrphanUploadDir(obsId: string): Promise<boolean> {
  if (!obsId || obsId.includes("..") || obsId.includes("/") || obsId.includes("\\")) {
    return false;
  }
  const row = await db.query.observations.findFirst({
    where: eq(observations.id, obsId),
    columns: { id: true },
  });
  if (row) return false;
  const abs = join(env.uploadDir, obsId);
  await rm(abs, { recursive: true, force: true });
  return true;
}

export async function findMissingMedia(): Promise<
  Array<{ id: string; displayPath: string; originalPath: string | null }>
> {
  const rows = await db.query.observations.findMany({
    columns: { id: true, displayPath: true, originalPath: true },
  });
  const missing: Array<{ id: string; displayPath: string; originalPath: string | null }> = [];
  for (const row of rows) {
    const displayAbs = join(env.uploadDir, row.displayPath);
    try {
      await access(displayAbs);
    } catch {
      missing.push({
        id: row.id,
        displayPath: row.displayPath,
        originalPath: row.originalPath,
      });
      continue;
    }
    if (row.originalPath) {
      try {
        await access(join(env.uploadDir, row.originalPath));
      } catch {
        missing.push({
          id: row.id,
          displayPath: row.displayPath,
          originalPath: row.originalPath,
        });
      }
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
