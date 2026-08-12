import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import maplibregl, { Map, Marker, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { t } from "@biotrace/messages";
import { api, type Observation } from "../api";
import { hasValidCoords } from "../geo";
import {
  AUTO_FIT_MAX_ZOOM,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  USER_MAX_ZOOM,
  attachBasemapFallback,
  fetchTiandituKeys,
  mapStyleForKeys,
} from "../map/style";

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let detachFallback: (() => void) | undefined;
    let map: Map | null = null;

    void (async () => {
      const keys = await fetchTiandituKeys();
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: mapStyleForKeys(keys),
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        maxZoom: USER_MAX_ZOOM,
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
      map.on("load", () => {
        if (!cancelled) setMapReady(true);
      });
      map.on("click", () => {
        setSelected(null);
        popupRef.current?.remove();
      });

      detachFallback = attachBasemapFallback(map, keys);
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      popupRef.current?.remove();
      popupRef.current = null;
      detachFallback?.();
      map?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listMappedObservations()
      .then(({ observations }) => {
        if (cancelled) return;
        observationsRef.current = observations.filter((o) => hasValidCoords(o.lat, o.lng));
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
    if (!map || !hasValidCoords(obs.lat, obs.lng)) return;
    const lat = obs.lat as number;
    const lng = obs.lng as number;
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
      .setLngLat([lng, lat])
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
      if (!hasValidCoords(obs.lat, obs.lng)) continue;
      const lat = obs.lat as number;
      const lng = obs.lng as number;
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
        .setLngLat([lng, lat])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([lng, lat]);
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
              {selected.locationLabel ||
                `${selected.lat?.toFixed(5)}, ${selected.lng?.toFixed(5)}`}
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
