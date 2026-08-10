import type { Map, StyleSpecification } from "maplibre-gl";

/** 天地图浏览器端 key；留空则回落 OpenFreeMap（OSM 数据，境内边界标注不合规，仅开发/兜底用）。 */
export const TIANDITU_KEY = import.meta.env.VITE_TIANDITU_KEY?.trim();
export const FALLBACK_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// TODO 合规：补天地图官方要求的审图号（形如 GS(20XX)XXXX号），文本以官方条款为准。
const TIANDITU_ATTRIBUTION = "天地图 · 国家地理信息公共服务平台";

/** t0~t7 多子域并行，缓解单域连接数瓶颈；必须用 _w 后缀（球面墨卡托EPSG:3857）。 */
function tiandituTiles(layer: "vec" | "cva"): string[] {
  return ["0", "1", "2", "3", "4", "5", "6", "7"].map(
    (s) =>
      `https://t${s}.tianditu.gov.cn/${layer}_w/wmts` +
      `?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}` +
      `&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
      `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_KEY}`,
  );
}

/** 矢量底图 + 中文注记两层叠加；两层各自独立计配额。 */
const TIANDITU_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "tianditu-vec": {
      type: "raster",
      tiles: tiandituTiles("vec"),
      tileSize: 256,
      attribution: TIANDITU_ATTRIBUTION,
    },
    "tianditu-cva": {
      type: "raster",
      tiles: tiandituTiles("cva"),
      tileSize: 256,
    },
  },
  layers: [
    { id: "tianditu-vec", type: "raster", source: "tianditu-vec" },
    { id: "tianditu-cva", type: "raster", source: "tianditu-cva" },
  ],
};

export const MAP_STYLE: StyleSpecification | string = TIANDITU_KEY
  ? TIANDITU_STYLE
  : FALLBACK_STYLE_URL;

/** 自动定位的落点缩放上限。压低可显著省瓦片配额（自动行为不必钻太深）。 */
export const AUTO_FIT_MAX_ZOOM = 10;
/** 用户主动缩放的上限，比自动定位放宽，保证还能看清具体位置。 */
export const USER_MAX_ZOOM = 14;
/** 无已有坐标时选点页的默认视野（中国概览，避免一上来钻太深烧配额）。 */
export const DEFAULT_MAP_CENTER: [number, number] = [105, 30];
export const DEFAULT_MAP_ZOOM = 2.2;
/** 已有坐标改点时的初始缩放（街道级以下，省瓦片）。 */
export const PIN_EXISTING_ZOOM = 10;

/**
 * 连续瓦片失败多少次就回落 OpenFreeMap。
 *
 * 为什么必须有这个：天地图矢量底图与注记**各 10000 次/日为硬墙，超量当天直接拒绝访问**、
 * 次日恢复，个人开发者无付费提额途径。而配额耗尽的表现正是 docs/planning/04f §10.1
 * 明确不接受的灰屏。仅按「有没有配 key」在构建时选底图救不了运行时失效。
 *
 * 阈值取 6：一屏双层约 16~32 个瓦片，偶发一两个失败不该触发切换；
 * 真正的配额耗尽/白名单失效会让整屏失败，很快越过这个数。
 */
const TILE_ERROR_LIMIT = 6;

/** 挂上天地图瓦片失败 → OpenFreeMap 回落；返回清理函数。 */
export function attachTiandituFallback(map: Map): () => void {
  if (!TIANDITU_KEY) return () => undefined;

  let fellBack = false;
  let tileErrors = 0;

  const onError = (ev: unknown) => {
    if (fellBack) return;
    // MapLibre 的 error 事件在瓦片失败时带 sourceId，但类型定义里没有它。
    const detail = ev as { sourceId?: string; error?: { status?: number } };
    if (detail.sourceId && !detail.sourceId.startsWith("tianditu")) return;

    tileErrors += 1;
    if (tileErrors < TILE_ERROR_LIMIT) return;

    fellBack = true;
    console.warn(
      `[map] 天地图瓦片连续失败 ${tileErrors} 次` +
        `（最近 status=${detail.error?.status ?? "?"}），已回落 OpenFreeMap。` +
        `可能原因：日配额耗尽（矢量底图/注记各 10000 次/日）、域名白名单不匹配、或网络故障。` +
        `注意 OpenFreeMap 为 OSM 数据，境内边界标注不合规，仅兜底。`,
    );
    map.setStyle(FALLBACK_STYLE_URL);
  };

  map.on("error", onError);
  return () => {
    map.off("error", onError);
  };
}
