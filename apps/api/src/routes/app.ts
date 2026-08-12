import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { t } from "@biotrace/messages";
import { env } from "../env.js";

const APK_NAME = "BioTrace.apk";
const MANIFEST_NAME = "latest.json";

export type AndroidReleaseManifest = {
  versionName: string;
  versionCode: number;
  notes?: string;
};

function manifestPath() {
  return join(env.androidReleaseDir, MANIFEST_NAME);
}

function apkPath() {
  return join(env.androidReleaseDir, APK_NAME);
}

async function readManifest(): Promise<AndroidReleaseManifest | null> {
  const path = manifestPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<AndroidReleaseManifest>;
    const versionName = typeof raw.versionName === "string" ? raw.versionName.trim() : "";
    const versionCode = Number(raw.versionCode);
    if (!/^\d+\.\d+\.\d+$/.test(versionName) || !Number.isFinite(versionCode) || versionCode < 1) {
      return null;
    }
    const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
    return {
      versionName,
      versionCode: Math.floor(versionCode),
      ...(notes ? { notes } : {}),
    };
  } catch {
    return null;
  }
}

export const appRoutes = new Hono();

/** 公开：当前侧载壳最新版本元数据（无包则 404）。 */
appRoutes.get("/android", async (c) => {
  const manifest = await readManifest();
  if (!manifest) {
    return c.json(
      { error: t("error.androidReleaseMissing"), code: "android_release_missing" },
      404,
    );
  }
  if (!existsSync(apkPath())) {
    return c.json(
      { error: t("error.androidReleaseMissing"), code: "android_apk_missing" },
      404,
    );
  }
  return c.json({
    versionName: manifest.versionName,
    versionCode: manifest.versionCode,
    notes: manifest.notes ?? null,
    apkUrl: "/api/app/android/apk",
  });
});

/** 公开：下载当前最新 APK（目录内仅保留一份 BioTrace.apk）。 */
appRoutes.get("/android/apk", async (c) => {
  const path = apkPath();
  if (!existsSync(path)) {
    return c.json(
      { error: t("error.androidReleaseMissing"), code: "android_apk_missing" },
      404,
    );
  }
  const info = await stat(path);
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename="${APK_NAME}"`,
      "Cache-Control": "no-store",
    },
  });
});
