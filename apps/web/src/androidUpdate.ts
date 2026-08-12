import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { FileOpener } from "@capacitor-community/file-opener";

export type AndroidUpdateInfo = {
  versionName: string;
  versionCode: number;
  notes: string | null;
  apkUrl: string;
};

export type SemVer = { major: number; minor: number; patch: number };

export function parseSemVer(versionName: string): SemVer | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(versionName.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

/** minor（或 major）落后 → 强更；仅 patch 落后不算。 */
export function needsForceUpdate(localName: string, remoteName: string): boolean {
  const local = parseSemVer(localName);
  const remote = parseSemVer(remoteName);
  if (!local || !remote) return false;
  if (remote.major !== local.major) return remote.major > local.major;
  return remote.minor > local.minor;
}

export function isNewerVersion(local: {
  versionName: string;
  versionCode: number;
}, remote: AndroidUpdateInfo): boolean {
  if (remote.versionCode > local.versionCode) return true;
  const a = parseSemVer(local.versionName);
  const b = parseSemVer(remote.versionName);
  if (!a || !b) return remote.versionCode > local.versionCode;
  if (b.major !== a.major) return b.major > a.major;
  if (b.minor !== a.minor) return b.minor > a.minor;
  return b.patch > a.patch;
}

export function isNativeAndroidShell(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

export async function getLocalAppVersion(): Promise<{
  versionName: string;
  versionCode: number;
} | null> {
  if (!isNativeAndroidShell()) return null;
  try {
    const info = await App.getInfo();
    const versionName = info.version?.trim() || "";
    const versionCode = Number(info.build);
    if (!versionName || !Number.isFinite(versionCode)) return null;
    return { versionName, versionCode: Math.floor(versionCode) };
  } catch {
    return null;
  }
}

export async function fetchAndroidUpdate(): Promise<AndroidUpdateInfo | null> {
  const res = await fetch("/api/app/android", { credentials: "include" });
  if (res.status === 404) return null;
  const data = (await res.json().catch(() => ({}))) as AndroidUpdateInfo & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `http ${res.status}`);
  }
  if (!data.versionName || !data.apkUrl || !Number.isFinite(Number(data.versionCode))) {
    throw new Error("invalid_android_update");
  }
  return {
    versionName: data.versionName,
    versionCode: Number(data.versionCode),
    notes: data.notes ?? null,
    apkUrl: data.apkUrl,
  };
}

function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

/** 下载最新 APK 并唤起系统安装页（无需用户翻文件夹）。 */
export async function downloadAndInstallApk(apkUrl: string): Promise<void> {
  if (!isNativeAndroidShell()) {
    throw new Error("not_android_shell");
  }
  const url = absoluteUrl(apkUrl);
  const path = `BioTrace-update.apk`;
  const downloaded = await Filesystem.downloadFile({
    path,
    url,
    directory: Directory.Cache,
  });
  const filePath = downloaded.path;
  if (!filePath) {
    throw new Error("download_path_missing");
  }
  await FileOpener.open({
    filePath,
    contentType: "application/vnd.android.package-archive",
    openWithDefault: true,
  });
}
