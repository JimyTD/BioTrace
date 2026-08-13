import { Capacitor } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";

/** Max photos per upload batch (gallery multi-select). */
export const MAX_UPLOAD_BATCH = 20;

function isUserCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /cancel/i.test(msg);
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

/** Native Capacitor shell: original-file gallery picker. */
export function canUseNativePicker(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * 系统相册原图 + ACCESS_MEDIA_LOCATION，避免 Photo Picker 把 GPS 涂成 0,0。
 * 不走应用内相机：系统相机 Intent 回传图通常没有 EXIF GPS。
 */
export async function pickImageNative(): Promise<File[]> {
  try {
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
