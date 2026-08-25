import type { Map, StyleSpecification } from "maplibre-gl";
import { t } from "@biotrace/messages";
import { themeMeta, type ColorScheme } from "../themes";

/**
 * 天地图浏览器端 key 链：主 key + 可选备用（逗号分隔多个）。
 * 均未配置时直接用内置简图（无国名注记的陆地轮廓）。
 */
function parseKeys(...chunks: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of chunks) {
    for (const part of (chunk ?? "").split(",")) {
      const key = part.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

export const TIANDITU_KEYS_BUILD = parseKeys(
  import.meta.env.VITE_TIANDITU_KEY,
  import.meta.env.VITE_TIANDITU_KEY_FALLBACK,
  import.meta.env.VITE_TIANDITU_KEY_FALLBACK_2,
);

/** @deprecated 构建期静态列表；运行时请用 fetchTiandituKeys / resolveMapStyle */
export const TIANDITU_KEYS = TIANDITU_KEYS_BUILD;

/** @deprecated 兼容旧引用；等价于 TIANDITU_KEYS[0] */
export const TIANDITU_KEY = TIANDITU_KEYS[0];

/** 审图号取自天地图官网首页 `mapdrawingApprovalNumber`（2026-08-11 核对为 GS(2025)1508号）；官网换号时改 messages。 */
const TIANDITU_ATTRIBUTION = t("map.tiandituAttribution");

/** t0~t7 多子域并行，缓解单域连接数瓶颈；必须用 _w 后缀（球面墨卡托 EPSG:3857）。 */
function tiandituTiles(key: string, layer: "vec" | "cva"): string[] {
  return ["0", "1", "2", "3", "4", "5", "6", "7"].map(
    (s) =>
      `https://t${s}.tianditu.gov.cn/${layer}_w/wmts` +
      `?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}` +
      `&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
      `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${key}`,
  );
}

/** 矢量底图 + 中文注记两层叠加；两层各自独立计配额。 */
export function tiandituStyle(key: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      "tianditu-vec": {
        type: "raster",
        tiles: tiandituTiles(key, "vec"),
        tileSize: 256,
        attribution: TIANDITU_ATTRIBUTION,
      },
      "tianditu-cva": {
        type: "raster",
        tiles: tiandituTiles(key, "cva"),
        tileSize: 256,
      },
    },
    layers: [
      { id: "tianditu-vec", type: "raster", source: "tianditu-vec" },
      { id: "tianditu-cva", type: "raster", source: "tianditu-cva" },
    ],
  };
}

/**
 * 内置简图：Natural Earth 1:50m 国界（China POV：台湾并入中国几何），无国名注记。
 * 用作天地图全部不可用时的最终回落（防灰屏，规避 OSM 国界表达风险）。
 */
/** 简图配色随皮肤明暗切换；深色皮肤下不能甩出一张亮白纸地图。 */
const SIMPLE_PALETTE: Record<ColorScheme, { sea: string; land: string[]; border: string }> = {
  light: {
    sea: "#c5d6e8",
    // MAPCOLOR7 轻微分色，便于分辨邻国，仍保持低对比「简图」气质
    land: ["#e7dfd2", "#e2d7c4", "#ebe3d6", "#ddd2c0", "#e9e0d0", "#e0d5c2", "#efe6da", "#e8e0d4"],
    border: "#8f7f68",
  },
  dark: {
    sea: "#0f1418",
    land: ["#2c231c", "#312720", "#281f19", "#352a22", "#2a221b", "#302620", "#372b23", "#2e251e"],
    border: "#6d5a46",
  },
};

export function simpleStyle(scheme: ColorScheme = themeMeta().scheme): StyleSpecification {
  const palette = SIMPLE_PALETTE[scheme];
  return {
    version: 8,
    sources: {
      countries: {
        type: "geojson",
        data: "/map/ne_50m_countries_chn_pov.geojson",
        attribution: t("map.simpleBasemapAttribution"),
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": palette.sea },
      },
      {
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": [
            "match",
            ["get", "c"],
            1,
            palette.land[0]!,
            2,
            palette.land[1]!,
            3,
            palette.land[2]!,
            4,
            palette.land[3]!,
            5,
            palette.land[4]!,
            6,
            palette.land[5]!,
            7,
            palette.land[6]!,
            palette.land[7]!,
          ],
        },
      },
      {
        id: "country-borders",
        type: "line",
        source: "countries",
        paint: {
          "line-color": palette.border,
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 4, 0.8, 8, 1.2],
          "line-opacity": 0.85,
        },
      },
    ],
  };
}

/** @deprecated 固定浅色版；随皮肤走请用 simpleStyle()。onboardBasemap 的预渲染与它同色。 */
export const SIMPLE_STYLE: StyleSpecification = simpleStyle("light");

export const MAP_STYLE: StyleSpecification = TIANDITU_KEYS_BUILD[0]
  ? tiandituStyle(TIANDITU_KEYS_BUILD[0])
  : simpleStyle();

/** Prefer API-served keys (admin overlay); fall back to build-time VITE_* keys. */
export async function fetchTiandituKeys(): Promise<string[]> {
  try {
    const res = await fetch("/api/map/tianditu-keys", { credentials: "same-origin" });
    if (res.ok) {
      const data = (await res.json()) as { keys?: string[] };
      if (Array.isArray(data.keys) && data.keys.length > 0) return data.keys;
    }
  } catch {
    /* fall through */
  }
  return [...TIANDITU_KEYS_BUILD];
}

export function mapStyleForKeys(keys: string[]): StyleSpecification {
  return keys[0] ? tiandituStyle(keys[0]!) : simpleStyle();
}

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
 * 连续瓦片失败多少次就切下一档回落。
 *
 * 天地图矢量底图与注记各 10000 次/日为硬墙，超量当天直接拒绝。
 * 阈值取 6：一屏双层约 16~32 个瓦片，偶发失败不该触发；配额耗尽会迅速越过。
 */
const TILE_ERROR_LIMIT = 6;

/**
 * 回落链：主天地图 key → 备用 key（可多个）→ 内置简图。
 * 不再使用 OpenFreeMap（OSM 国界/地名在大陆不合规）。
 */
export function attachBasemapFallback(map: Map, keys: string[] = TIANDITU_KEYS_BUILD): () => void {
  if (keys.length === 0) return () => undefined;

  /** 当前正在用的天地图 key 下标；`keys.length` 表示已落到简图。 */
  let keyIndex = 0;
  let tileErrors = 0;
  let detached = false;

  const onError = (ev: unknown) => {
    if (detached || keyIndex >= keys.length) return;
    // MapLibre 的 error 事件在瓦片失败时带 sourceId，但类型定义里没有它。
    const detail = ev as { sourceId?: string; error?: { status?: number } };
    if (detail.sourceId && !detail.sourceId.startsWith("tianditu")) return;

    tileErrors += 1;
    if (tileErrors < TILE_ERROR_LIMIT) return;

    const status = detail.error?.status ?? "?";
    const next = keyIndex + 1;
    tileErrors = 0;

    if (next < keys.length) {
      console.warn(
        `[map] 天地图浏览器端 key ${keyIndex + 1}/${keys.length} 瓦片连续失败` +
          `（最近 status=${status}），切换备用 key ${next + 1}/${keys.length}。` +
          `可能原因：日配额耗尽、域名白名单不匹配、或网络故障。`,
      );
      keyIndex = next;
      map.setStyle(tiandituStyle(keys[next]!));
      return;
    }

    console.warn(
      `[map] 天地图全部浏览器端 key 均失败（最近 status=${status}），` +
        `已回落内置简图（Natural Earth 国界 / China POV，无国名注记）。`,
    );
    keyIndex = keys.length;
    map.setStyle(simpleStyle());
  };

  map.on("error", onError);
  return () => {
    detached = true;
    map.off("error", onError);
  };
}

/** @deprecated 使用 attachBasemapFallback */
export const attachTiandituFallback = attachBasemapFallback;
