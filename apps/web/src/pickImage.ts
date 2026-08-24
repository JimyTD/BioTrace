import { Camera, CameraResultType, CameraSource, type Photo } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { FilePicker } from "@capawesome/capacitor-file-picker";

export type PickImageMode = "gallery" | "camera";

/** Max photos per upload batch (gallery multi-select). */
export const MAX_UPLOAD_BATCH = 20;

/** 现场拍时另取的设备点；EXIF 有效 GPS 仍优先。 */
export type DeviceFix = {
  lat: number | null;
  lng: number | null;
  capturedAt: Date;
};

function isUserCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /cancel/i.test(msg);
}

function validFix(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (Math.abs(lat) < 1e-5 && Math.abs(lng) < 1e-5) return null;
  return { lat, lng };
}

async function photoToFile(photo: Photo, index = 0): Promise<File> {
  if (!photo.webPath) {
    throw new Error("missing_web_path");
  }
  const res = await fetch(photo.webPath);
  const blob = await res.blob();
  const format = (photo.format || "jpeg").toLowerCase();
  const mime = blob.type || `image/${format === "jpg" ? "jpeg" : format}`;
  const ext = format === "jpeg" ? "jpg" : format;
  return new File([blob], `observation-${index + 1}.${ext}`, { type: mime });
}

async function pickedPathToFile(
  path: string,
  name: string | undefined,
  mimeType: string | undefined,
  index: number,
): Promise<File> {
  const url = Capacitor.convertFileSrc(path);
  const res = await fetch(url);
  const blob = await res.blob();
  const mime = mimeType || blob.type || "image/jpeg";
  const fallbackExt = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const fileName = name?.trim() || `observation-${index + 1}.${fallbackExt}`;
  return new File([blob], fileName, { type: mime });
}

/** Native Capacitor shell: system camera / original-file gallery picker. */
export function canUseNativePicker(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function readBrowserFix(timeoutMs: number): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(validFix(pos.coords.latitude, pos.coords.longitude)),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 },
    );
  });
}

async function readNativeFix(timeoutMs: number): Promise<{ lat: number; lng: number } | null> {
  try {
    await Geolocation.requestPermissions();
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 15_000,
    });
    return validFix(pos.coords.latitude, pos.coords.longitude);
  } catch {
    return null;
  }
}

/**
 * 系统相机 Intent / Camera.getPhoto 回传图通常没有 EXIF GPS。
 * 拍照时另取设备当前位置；权限被拒、旧壳没有 Geolocation 插件、超时都不挡拍照。
 */
export async function readDeviceFix(): Promise<DeviceFix> {
  const capturedAt = new Date();
  const timeoutMs = 8_000;
  const coords = canUseNativePicker()
    ? await readNativeFix(timeoutMs)
    : await readBrowserFix(timeoutMs);
  return { lat: coords?.lat ?? null, lng: coords?.lng ?? null, capturedAt };
}

/** 相机 Activity 可能打断第一次定位；拍完若还没有坐标再取一次。 */
export async function resolveDeviceFix(pending: Promise<DeviceFix> | null): Promise<DeviceFix> {
  const first = pending ? await pending : await readDeviceFix();
  if (first.lat != null && first.lng != null) return first;
  const retry = await readDeviceFix();
  if (retry.lat != null && retry.lng != null) return retry;
  return first.capturedAt ? first : retry;
}

/**
 * Camera：一张。回传图常无 GPS，定位靠 readDeviceFix。
 * Gallery：FilePicker 原图 + ACCESS_MEDIA_LOCATION，避免 Photo Picker 把 GPS 涂成 0,0。
 */
export async function pickImageNative(mode: PickImageMode): Promise<File[]> {
  try {
    if (mode === "camera") {
      const photo = await Camera.getPhoto({
        quality: 95,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        correctOrientation: true,
      });
      return [await photoToFile(photo, 0)];
    }

    try {
      await FilePicker.requestPermissions({ permissions: ["accessMediaLocation"] });
    } catch {
      // 权限被拒时仍尝试选图；可能无 GPS，服务端会当成无定位
    }

    // Android FilePicker：limit 仅支持 0（不限）或 1；用 0 再在客户端截断。
    const result = await FilePicker.pickImages({
      limit: 0,
      readData: false,
      skipTranscoding: true,
    });
    const picked = (result.files ?? []).slice(0, MAX_UPLOAD_BATCH);
    if (picked.length === 0) return [];

    const files: File[] = [];
    for (let i = 0; i < picked.length; i++) {
      const f = picked[i]!;
      if (!f.path) continue;
      files.push(await pickedPathToFile(f.path, f.name, f.mimeType, i));
    }
    return files;
  } catch (err) {
    if (isUserCancel(err)) return [];
    throw err;
  }
}
