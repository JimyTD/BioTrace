import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import maplibregl, { Map, Marker, Popup, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { t } from "@biotrace/messages";
import { api, type Observation } from "../api";

/** 天地图浏览器端 key；留空则回落 OpenFreeMap（OSM 数据，境内边界标注不合规，仅开发/兜底用）。 */
const TIANDITU_KEY = import.meta.env.VITE_TIANDITU_KEY?.trim();
const FALLBACK_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

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

const MAP_STYLE: StyleSpecification | string = TIANDITU_KEY
  ? TIANDITU_STYLE
  : FALLBACK_STYLE_URL;

/** 自动定位的落点缩放上限。压低可显著省瓦片配额（自动行为不必钻太深）。 */
const AUTO_FIT_MAX_ZOOM = 10;
/** 用户主动缩放的上限，比自动定位放宽，保证还能看清具体位置。 */
const USER_MAX_ZOOM = 14;

/**
 * 连续瓦片失败多少次就回落 OpenFreeMap。
 *
 * 为什么必须有这个：天地图矢量底图与注记**各 10000 次/日为硬墙，超量当天直接拒绝访问**、
 * 次日恢复，个人开发者无付费提额途径。而配额耗尽的表现正是 docs/04f §10.1
 * 明确不接受的灰屏。仅按「有没有配 key」在构建时选底图救不了运行时失效。
 *
 * 阈值取 6：一屏双层约 16~32 个瓦片，偶发一两个失败不该触发切换；
 * 真正的配额耗尽/白名单失效会让整屏失败，很快越过这个数。
 */
const TILE_ERROR_LIMIT = 6;

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);
  const observationsRef = useRef<Observation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<Observation | null>(null);
  const [mapReady, setMapReady] = useState(false);
  /** 已回落则不再计数、不再重复切换（本次会话内单向，不自动切回）。 */
  const fellBackRef = useRef(false);
  const tileErrorsRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [105, 30],
      zoom: 2.2,
      maxZoom: USER_MAX_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.on("load", () => setMapReady(true));
    map.on("click", () => {
      setSelected(null);
      popupRef.current?.remove();
    });

    // 只有正在用天地图时才需要这条保险；本来就跑 OpenFreeMap 时无处可退。
    if (TIANDITU_KEY) {
      map.on("error", (ev) => {
        if (fellBackRef.current) return;
        // MapLibre 的 error 事件在瓦片失败时带sourceId，但类型定义里没有它。
        const detail = ev as unknown as { sourceId?: string; error?: { status?: number } };
        // 有 sourceId 且明确不是天地图 → 与本保险无关。
        // 没有 sourceId 时仍计数：此刻无法区分，而漏切的代价是灰屏。
        if (detail.sourceId && !detail.sourceId.startsWith("tianditu")) return;

        tileErrorsRef.current += 1;
        if (tileErrorsRef.current < TILE_ERROR_LIMIT) return;

        fellBackRef.current = true;
        // 留痕：否则可能长期静默跑在不合规底图上，使合规改造失效。
        console.warn(
          `[map] 天地图瓦片连续失败 ${tileErrorsRef.current} 次` +
            `（最近 status=${detail.error?.status ?? "?"}），已回落 OpenFreeMap。` +
            `可能原因：日配额耗尽（矢量底图/注记各 10000 次/日）、域名白名单不匹配、或网络故障。` +
            `注意 OpenFreeMap 为 OSM 数据，境内边界标注不合规，仅兜底。`,
        );
        // Marker/Popup 挂在 map 上而非 style 上，setStyle 不会清掉它们；
        // attribution 来自 style/source，切换后会自动改为 OpenFreeMap 的署名。
        map.setStyle(FALLBACK_STYLE_URL);
      });
    }

    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
      fellBackRef.current = false;
      tileErrorsRef.current = 0;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listMappedObservations()
      .then(({ observations }) => {
        if (cancelled) return;
        observationsRef.current = observations.filter((o) => o.lat != null && o.lng != null);
        setCount(observationsRef.current.length);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("map.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    paintMarkers(observationsRef.current);
  }, [mapReady, count]);

  function selectObservation(obs: Observation) {
    const map = mapRef.current;
    if (!map || obs.lat == null || obs.lng == null) return;
    setSelected(obs);

    markersRef.current.forEach((m) => {
      const el = m.getElement();
      el.classList.toggle("is-selected", el.dataset.obsId === obs.id);
    });

    popupRef.current?.remove();
    const pending = obs.status === "pending_settle" || obs.status === "analyzing";
    const title = pending
      ? t(obs.status === "pending_settle" ? "status.pending_settle" : "status.analyzing")
      : obs.commonName || obs.scientificName || t("map.observationFallback");
    const popup = new maplibregl.Popup({ offset: 16, closeButton: true, maxWidth: "240px" })
      .setLngLat([obs.lng, obs.lat])
      .setHTML(
        `<div class="map-popup">
          <img src="${obs.displayUrl}" alt="" />
          <strong>${escapeHtml(title)}</strong>
        </div>`,
      )
      .addTo(map);
    popupRef.current = popup;
  }

  function paintMarkers(observations: Observation[]) {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    popupRef.current?.remove();
    popupRef.current = null;

    const bounds = new maplibregl.LngLatBounds();
    for (const obs of observations) {
      if (obs.lat == null || obs.lng == null) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-dot";
      el.dataset.obsId = obs.id;
      el.setAttribute(
        "aria-label",
        obs.commonName || obs.scientificName || t("map.observationFallback"),
      );
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectObservation(obs);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([obs.lng, obs.lat])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([obs.lng, obs.lat]);
    }

    if (!bounds.isEmpty()) {
      // duration: 0 —— 飞行动画会途经十来个 zoom 级别，每级都拉一批瓦片，
      // 而用户只看得到最终那一屏。直接跳转可省掉这部分配额消耗。
      map.fitBounds(bounds, { padding: 48, maxZoom: AUTO_FIT_MAX_ZOOM, duration: 0 });
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 className="brand">{t("map.title")}</h1>
        <p className="lede">{t("map.lede")}</p>
      </div>
      <div className="map-wrap" ref={containerRef} />
      {selected ? (
        <div className="panel map-selection row">
          <img className="map-selection-thumb" src={selected.displayUrl} alt="" />
          <div className="stack" style={{ gap: 4, flex: 1 }}>
            <strong>
              {selected.status === "pending_settle" || selected.status === "analyzing"
                ? t(
                    selected.status === "pending_settle"
                      ? "status.pending_settle"
                      : "status.analyzing",
                  )
                : selected.commonName ||
                  selected.scientificName ||
                  t("map.observationFallback")}
            </strong>
            <span className="muted">
              {selected.lat?.toFixed(5)}, {selected.lng?.toFixed(5)}
            </span>
            <div className="row">
              <Link
                className="btn secondary"
                to={
                  selected.status === "pending_settle"
                    ? `/settle/${selected.id}`
                    : `/observations/${selected.id}`
                }
              >
                {selected.status === "pending_settle" ? t("settle.open") : t("map.openDetail")}
              </Link>
              <Link className="btn secondary" to={`/trips/${selected.tripId}`}>
                {t("map.openTrip")}
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <p className="muted">
          {t("map.countHint", { count })}
          {error ? ` · ${error}` : ""}
        </p>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
