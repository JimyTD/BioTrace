import { Camera, CameraResultType, CameraSource, type Photo } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";

export type PickImageMode = "gallery" | "camera";

/** Max photos per upload batch (gallery multi-select). */
export const MAX_UPLOAD_BATCH = 20;

function isUserCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /cancel/i.test(msg);
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

/**
 * Camera: one photo (device capture usually keeps GPS).
 * Gallery: FilePicker 原图 + ACCESS_MEDIA_LOCATION，避免 Photo Picker 把 GPS 涂成 0,0。
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
