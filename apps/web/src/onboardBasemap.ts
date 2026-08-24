/** 与 `SIMPLE_STYLE` 同色：预渲染 Natural Earth 简图，运行时不再 parse geojson。 */

const OCEAN = "#c5d6e8";
const WORLD_SRC = "/onboard/world.png";

/** 世界视野，中国落点仍在画面里。 */
const CENTER: [number, number] = [20, 18];
const ZOOM = 1.15;

let worldImg: HTMLImageElement | null = null;
let worldP: Promise<HTMLImageElement> | null = null;

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

export function prefetchOnboardBasemap() {
  void loadOnboardWorld();
}

function loadOnboardWorld() {
  if (worldImg) return Promise.resolve(worldImg);
  worldP ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      worldImg = img;
      resolve(img);
    };
    img.onerror = () => {
      worldP = null;
      reject(new Error("onboard_basemap"));
    };
    img.src = WORLD_SRC;
  });
  return worldP;
}

export async function paintOnboardBasemap(canvas: HTMLCanvasElement, fold: HTMLElement) {
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
  try {
    const img = await loadOnboardWorld();
    if (!fold.isConnected) return;
    const worldPx = 256 * 2 ** ZOOM;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      w / 2 - mercX(CENTER[0]) * worldPx,
      h / 2 - mercY(CENTER[1]) * worldPx,
      worldPx,
      worldPx,
    );
  } catch {
    /* 只留海色，不挡翻页 */
  }
}
