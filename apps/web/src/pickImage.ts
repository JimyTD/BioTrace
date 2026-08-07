import { Camera, CameraResultType, CameraSource, type GalleryPhoto, type Photo } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

export type PickImageMode = "gallery" | "camera";

/** Max photos per upload batch (gallery multi-select). */
export const MAX_UPLOAD_BATCH = 20;

function isUserCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /cancel/i.test(msg);
}

async function photoToFile(photo: Photo | GalleryPhoto, index = 0): Promise<File> {
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

/** Native Capacitor shell: system camera / photo picker (not the file manager). */
export function canUseNativePicker(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Camera: one photo. Gallery: multi-select via pickImages (falls back to single getPhoto).
 */
export async function pickImageNative(mode: PickImageMode): Promise<File[]> {
  try {
    if (mode === "camera") {
      const photo = await Camera.getPhoto({
        quality: 92,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        correctOrientation: true,
      });
      return [await photoToFile(photo, 0)];
    }

    try {
      const gallery = await Camera.pickImages({
        quality: 92,
        correctOrientation: true,
        limit: MAX_UPLOAD_BATCH,
      });
      const photos = gallery.photos ?? [];
      if (photos.length === 0) return [];
      const files: File[] = [];
      for (let i = 0; i < photos.length; i++) {
        files.push(await photoToFile(photos[i]!, i));
      }
      return files;
    } catch (err) {
      // Older shells / cancel: try single-photo path unless user cancelled.
      if (isUserCancel(err)) return [];
      const photo = await Camera.getPhoto({
        quality: 92,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
        correctOrientation: true,
      });
      return [await photoToFile(photo, 0)];
    }
  } catch (err) {
    if (isUserCancel(err)) return [];
    throw err;
  }
}
