import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import exifr from "exifr";
import { env } from "../env.js";

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
    const lat =
      typeof data?.latitude === "number"
        ? data.latitude
        : typeof data?.GPSLatitude === "number"
          ? data.GPSLatitude
          : null;
    const lng =
      typeof data?.longitude === "number"
        ? data.longitude
        : typeof data?.GPSLongitude === "number"
          ? data.GPSLongitude
          : null;
    const rawDate = data?.DateTimeOriginal ?? data?.CreateDate ?? null;
    const capturedAt = rawDate instanceof Date ? rawDate : rawDate ? new Date(rawDate) : null;
    return {
      capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null,
      lat: lat != null && Number.isFinite(lat) ? lat : null,
      lng: lng != null && Number.isFinite(lng) ? lng : null,
    };
  } catch {
    return { capturedAt: null, lat: null, lng: null };
  }
}

export async function saveDisplayImage(opts: {
  observationId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}): Promise<{ relativePath: string; absolutePath: string; mimeType: string }> {
  const dir = join(env.uploadDir, opts.observationId);
  await mkdir(dir, { recursive: true });
  const relativePath = `${opts.observationId}/display.jpg`;
  const absolutePath = join(env.uploadDir, relativePath);

  await sharp(opts.buffer)
    .rotate()
    .resize({
      width: env.displayMaxEdge,
      height: env.displayMaxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toFile(absolutePath);

  return { relativePath, absolutePath, mimeType: "image/jpeg" };
}
