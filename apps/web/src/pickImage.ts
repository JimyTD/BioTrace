import { Camera, CameraResultType, CameraSource, type Photo } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

export type PickImageMode = "gallery" | "camera";

function isUserCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /cancel/i.test(msg);
}

async function photoToFile(photo: Photo): Promise<File> {
  if (!photo.webPath) {
    throw new Error("missing_web_path");
  }
  const res = await fetch(photo.webPath);
  const blob = await res.blob();
  const format = (photo.format || "jpeg").toLowerCase();
  const mime = blob.type || `image/${format === "jpg" ? "jpeg" : format}`;
  const ext = format === "jpeg" ? "jpg" : format;
  return new File([blob], `observation.${ext}`, { type: mime });
}

/** Native Capacitor shell: system camera / photo picker (not the file manager). */
export function canUseNativePicker(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function pickImageNative(mode: PickImageMode): Promise<File | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 92,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: mode === "camera" ? CameraSource.Camera : CameraSource.Photos,
      correctOrientation: true,
    });
    return await photoToFile(photo);
  } catch (err) {
    if (isUserCancel(err)) return null;
    throw err;
  }
}
