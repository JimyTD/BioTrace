import { createRequire } from "node:module";

type ExistingExif = {
  capturedAt: Date | null;
  lat: number | null;
  lng: number | null;
};

const require = createRequire(import.meta.url);
const piexif = require("piexifjs") as {
  load: (jpeg: string) => {
    "0th": Record<number, unknown>;
    Exif: Record<number, unknown>;
    GPS: Record<number, unknown>;
    Interop?: Record<number, unknown>;
    "1st"?: Record<number, unknown>;
    thumbnail?: string | null;
  };
  dump: (obj: object) => string;
  insert: (exif: string, jpeg: string) => string;
  GPSHelper: {
    degToDmsRational: (deg: number) => [[number, number], [number, number], [number, number]];
  };
  GPSIFD: {
    GPSVersionID: number;
    GPSLatitudeRef: number;
    GPSLatitude: number;
    GPSLongitudeRef: number;
    GPSLongitude: number;
    GPSTimeStamp: number;
    GPSDateStamp: number;
  };
  ImageIFD: { DateTime: number };
  ExifIFD: { DateTimeOriginal: number; DateTimeDigitized: number };
};

function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * DateTimeOriginal 无时区，exifr 会按进程本地时区读。
 * 写成本地墙钟，读回来才是同一个瞬间。GPS 日期时间仍按规范用 UTC。
 */
function exifDateTimeLocal(d: Date): string {
  return `${d.getFullYear()}:${pad2(d.getMonth() + 1)}:${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function gpsDateStampUtc(d: Date): string {
  return `${d.getUTCFullYear()}:${pad2(d.getUTCMonth() + 1)}:${pad2(d.getUTCDate())}`;
}

/**
 * 系统相机回传图通常没有 GPS。把设备定位 / 拍摄时间写进 JPEG EXIF。
 * 已有有效 GPS 或拍摄时间的字段不覆盖。非 JPEG 原样返回。写入失败不抛。
 */
export function embedFallbackExif(
  buffer: Buffer,
  fallback: { lat: number | null; lng: number | null; capturedAt: Date | null },
  existing: ExistingExif,
): Buffer {
  if (!isJpeg(buffer)) return buffer;
  const needGps = existing.lat == null && fallback.lat != null && fallback.lng != null;
  const needDate = existing.capturedAt == null && fallback.capturedAt != null;
  if (!needGps && !needDate) return buffer;

  try {
    const binary = buffer.toString("latin1");
    const exifObj = piexif.load(binary);
    exifObj["0th"] ??= {};
    exifObj.Exif ??= {};
    exifObj.GPS ??= {};

    if (needDate && fallback.capturedAt) {
      const stamp = exifDateTimeLocal(fallback.capturedAt);
      exifObj["0th"][piexif.ImageIFD.DateTime] = stamp;
      exifObj.Exif[piexif.ExifIFD.DateTimeOriginal] = stamp;
      exifObj.Exif[piexif.ExifIFD.DateTimeDigitized] = stamp;
    }

    if (needGps && fallback.lat != null && fallback.lng != null) {
      const lat = fallback.lat;
      const lng = fallback.lng;
      exifObj.GPS[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
      exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
      exifObj.GPS[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(lat);
      exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
      exifObj.GPS[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(lng);
      const when = fallback.capturedAt ?? existing.capturedAt ?? new Date();
      exifObj.GPS[piexif.GPSIFD.GPSDateStamp] = gpsDateStampUtc(when);
      exifObj.GPS[piexif.GPSIFD.GPSTimeStamp] = [
        [when.getUTCHours(), 1],
        [when.getUTCMinutes(), 1],
        [when.getUTCSeconds(), 1],
      ];
    }

    const dumped = piexif.dump(exifObj);
    return Buffer.from(piexif.insert(dumped, binary), "latin1");
  } catch {
    return buffer;
  }
}
