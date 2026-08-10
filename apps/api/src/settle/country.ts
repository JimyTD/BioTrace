/** Minimal offline country guess from lat/lng (bbox-first). Good enough for Cut 2 seed alerts. */

type Box = { code: string; minLat: number; maxLat: number; minLng: number; maxLng: number };

// Rough boxes; first match wins — order more specific regions before large ones if needed.
const BOXES: Box[] = [
  { code: "CN", minLat: 18.0, maxLat: 53.6, minLng: 73.5, maxLng: 135.1 },
  { code: "JP", minLat: 24.2, maxLat: 45.6, minLng: 122.9, maxLng: 146.0 },
  { code: "KR", minLat: 33.0, maxLat: 38.7, minLng: 124.5, maxLng: 132.0 },
  { code: "TW", minLat: 21.8, maxLat: 25.4, minLng: 119.5, maxLng: 122.1 },
  { code: "US", minLat: 24.5, maxLat: 49.4, minLng: -125.0, maxLng: -66.9 },
  { code: "CA", minLat: 41.6, maxLat: 83.2, minLng: -141.0, maxLng: -52.6 },
  { code: "AU", minLat: -43.7, maxLat: -10.0, minLng: 112.9, maxLng: 153.7 },
  { code: "NZ", minLat: -47.3, maxLat: -34.0, minLng: 166.0, maxLng: 179.0 },
  { code: "GB", minLat: 49.8, maxLat: 60.9, minLng: -8.7, maxLng: 1.8 },
  { code: "FR", minLat: 41.3, maxLat: 51.2, minLng: -5.2, maxLng: 9.6 },
  { code: "DE", minLat: 47.2, maxLat: 55.1, minLng: 5.8, maxLng: 15.1 },
  { code: "IT", minLat: 36.6, maxLat: 47.1, minLng: 6.6, maxLng: 18.6 },
  { code: "ES", minLat: 35.9, maxLat: 43.8, minLng: -9.4, maxLng: 3.4 },
  { code: "TH", minLat: 5.6, maxLat: 20.5, minLng: 97.3, maxLng: 105.7 },
  { code: "VN", minLat: 8.4, maxLat: 23.4, minLng: 102.1, maxLng: 109.5 },
  { code: "MY", minLat: 0.8, maxLat: 7.5, minLng: 99.6, maxLng: 119.3 },
  { code: "ID", minLat: -11.1, maxLat: 6.1, minLng: 95.0, maxLng: 141.0 },
  { code: "IN", minLat: 6.7, maxLat: 35.5, minLng: 68.1, maxLng: 97.4 },
  { code: "BR", minLat: -33.8, maxLat: 5.3, minLng: -74.0, maxLng: -34.7 },
  { code: "MX", minLat: 14.5, maxLat: 32.7, minLng: -118.5, maxLng: -86.7 },
  { code: "ZA", minLat: -35.0, maxLat: -22.1, minLng: 16.4, maxLng: 33.0 },
  { code: "KE", minLat: -4.8, maxLat: 5.1, minLng: 33.9, maxLng: 42.0 },
  { code: "SG", minLat: 1.15, maxLat: 1.48, minLng: 103.6, maxLng: 104.1 },
];

export function countryFromLatLng(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const b of BOXES) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
      return b.code;
    }
  }
  return null;
}
