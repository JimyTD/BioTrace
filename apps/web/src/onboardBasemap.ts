/** 与 `SIMPLE_STYLE` 同色：Natural Earth 简图填色。 */

const FILL: Record<number, string> = {
  1: "#e7dfd2",
  2: "#e2d7c4",
  3: "#ebe3d6",
  4: "#ddd2c0",
  5: "#e9e0d0",
  6: "#e0d5c2",
  7: "#efe6da",
};

const OCEAN = "#c5d6e8";
const BORDER = "rgba(143, 127, 104, 0.85)";

/** 世界视野，中国落点仍在画面里。 */
const CENTER: [number, number] = [20, 18];
const ZOOM = 1.15;

type Ring = number[][];
type Poly = Ring[];
type Geometry = {
  type: string;
  coordinates: unknown;
};

let countriesP: Promise<{ features: { properties: { c?: number }; geometry: Geometry }[] }> | null =
  null;

export function loadOnboardCountries() {
  countriesP ??= fetch("/map/ne_50m_countries_chn_pov.geojson").then((r) => r.json());
  return countriesP;
}

function mercX(lng: number) {
  return (lng + 180) / 360;
}

function mercY(lat: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return Math.min(1, Math.max(0, y));
}

export function projectOnboardLngLat(lng: number, lat: number, w: number, h: number): [number, number] {
  const scale = 256 * 2 ** ZOOM;
  return [
    w / 2 + (mercX(lng) - mercX(CENTER[0])) * scale,
    h / 2 + (mercY(lat) - mercY(CENTER[1])) * scale,
  ];
}

function drawRing(ctx: CanvasRenderingContext2D, ring: Ring, w: number, h: number) {
  if (!ring || ring.length < 3) return false;
  ctx.beginPath();
  let started = false;
  let prevLng: number | null = null;
  for (const pt of ring) {
    const lng = pt[0]!;
    const lat = pt[1]!;
    const [x, y] = projectOnboardLngLat(lng, lat, w, h);
    if (prevLng !== null && Math.abs(lng - prevLng) > 180) {
      ctx.closePath();
      ctx.beginPath();
      started = false;
    }
    if (!started) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    started = true;
    prevLng = lng;
  }
  ctx.closePath();
  return started;
}

function walkPolys(geom: Geometry, visit: (poly: Poly) => void) {
  if (geom.type === "Polygon") visit(geom.coordinates as Poly);
  else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates as Poly[]) visit(poly);
  }
}

export async function paintOnboardBasemap(canvas: HTMLCanvasElement, fold: HTMLElement) {
  const data = await loadOnboardCountries();
  if (!fold.isConnected) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = fold.clientWidth;
  const h = fold.clientHeight;
  if (w < 8 || h < 8) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = OCEAN;
  ctx.fillRect(0, 0, w, h);
  ctx.lineJoin = "round";
  for (const feat of data.features) {
    const color = FILL[feat.properties.c ?? 0] ?? "#e8e0d4";
    walkPolys(feat.geometry, (poly) => {
      ctx.fillStyle = color;
      if (drawRing(ctx, poly[0]!, w, h)) ctx.fill();
      for (let i = 1; i < poly.length; i++) {
        ctx.fillStyle = OCEAN;
        if (drawRing(ctx, poly[i]!, w, h)) ctx.fill();
      }
    });
  }
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  for (const feat of data.features) {
    walkPolys(feat.geometry, (poly) => {
      if (drawRing(ctx, poly[0]!, w, h)) ctx.stroke();
    });
  }
}
