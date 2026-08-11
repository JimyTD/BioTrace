import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import exifr from "exifr";
import { env } from "../env.js";
import { validCoords } from "../settle/geo/coords.js";

export type ExifMeta = {
  capturedAt: Date | null;
  lat: number | null;
  lng: number | null;
};

export async function readExif(buffer: Buffer): Promise<ExifMeta> {
  try {
    const data = await exifr.parse(buffer, {
      pick: ["DateTimeOriginal", "CreateDate", "GPSLatitude", "GPSLongitude", "latitude", "longitude"],
    });
    const rawLat =
      typeof data?.latitude === "number"
        ? data.latitude
        : typeof data?.GPSLatitude === "number"
          ? data.GPSLatitude
          : null;
    const rawLng =
      typeof data?.longitude === "number"
        ? data.longitude
        : typeof data?.GPSLongitude === "number"
          ? data.GPSLongitude
          : null;
    const coords = validCoords(rawLat, rawLng);
    const rawDate = data?.DateTimeOriginal ?? data?.CreateDate ?? null;
    const capturedAt = rawDate instanceof Date ? rawDate : rawDate ? new Date(rawDate) : null;
    return {
      capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    };
  } catch {
    return { capturedAt: null, lat: null, lng: null };
  }
}

function extForMime(mimeType: string, originalName: string): string {
  const fromName = originalName.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName) && fromName !== "jpeg") {
    return fromName === "jpg" ? "jpg" : fromName;
  }
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic") || mimeType.includes("heif")) return "heic";
  return "jpg";
}

/**
 * 落盘原图 + 展示用 JPEG（列表/地图/识图）。
 * 原图供相册高清与字节级去重；display 控制带宽。
 */
export async function saveObservationMedia(opts: {
  observationId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}): Promise<{
  displayPath: string;
  displayAbsolutePath: string;
  originalPath: string;
  mimeType: string;
}> {
  const dir = join(env.uploadDir, opts.observationId);
  await mkdir(dir, { recursive: true });

  const ext = extForMime(opts.mimeType, opts.originalName);
  const originalPath = `${opts.observationId}/original.${ext}`;
  const originalAbs = join(env.uploadDir, originalPath);
  await writeFile(originalAbs, opts.buffer);

  const displayPath = `${opts.observationId}/display.jpg`;
  const displayAbsolutePath = join(env.uploadDir, displayPath);
  await sharp(opts.buffer)
    .rotate()
    .resize({
      width: env.displayMaxEdge,
      height: env.displayMaxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toFile(displayAbsolutePath);

  return {
    displayPath,
    displayAbsolutePath,
    originalPath,
    mimeType: "image/jpeg",
  };
}

/** @deprecated 使用 saveObservationMedia */
export async function saveDisplayImage(opts: {
  observationId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}): Promise<{ relativePath: string; absolutePath: string; mimeType: string }> {
  const saved = await saveObservationMedia(opts);
  return {
    relativePath: saved.displayPath,
    absolutePath: saved.displayAbsolutePath,
    mimeType: saved.mimeType,
  };
}
