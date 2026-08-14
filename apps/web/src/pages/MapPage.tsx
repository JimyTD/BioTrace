import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import maplibregl, { Map, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { t } from "@biotrace/messages";
import { api, type Observation } from "../api";
import { hasValidCoords } from "../geo";
import { easeOutCubic, prefersReducedMotion, tween } from "../motion";
import {
  AUTO_FIT_MAX_ZOOM,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  USER_MAX_ZOOM,
  attachBasemapFallback,
  fetchTiandituKeys,
  mapStyleForKeys,
} from "../map/style";

function obsTitle(obs: Observation) {
  if (obs.status === "pending_settle") return t("status.pending_settle");
  if (obs.status === "analyzing") return t("status.analyzing");
  return obs.commonName || obs.scientificName || t("map.observationFallback");
}

function obsHref(obs: Observation) {
  return obs.status === "pending_settle" ? `/settle/${obs.id}` : `/observations/${obs.id}`;
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const observationsRef = useRef<Observation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Observation | null>(null);
  const [sheet, setSheet] = useState<Observation | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sheetOpen = useRef(false);

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
        markersRef.current.forEach((m) => m.getElement().classList.remove("is-selected"));
      });

      detachFallback = attachBasemapFallback(map, keys);
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
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
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    paintMarkers(observationsRef.current);
  }, [mapReady, count]);

  useEffect(() => {
    mapRef.current?.resize();
  }, [sheet, mapReady]);

  useLayoutEffect(() => {
    const wrap = containerRef.current;
    if (!wrap || prefersReducedMotion()) return;
    wrap.style.opacity = "0";
    wrap.style.transform = "translateY(22%)";
    let cancelled = false;
    void tween(
      520,
      (t) => {
        const e = easeOutCubic(t);
        wrap.style.opacity = String(e);
        wrap.style.transform = `translateY(${(1 - e) * 22}%)`;
      },
      () => cancelled,
    ).then(() => {
      if (cancelled) return;
      wrap.style.opacity = "";
      wrap.style.transform = "";
      mapRef.current?.resize();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (selected) setSheet(selected);
  }, [selected]);

  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el || !sheet) return;
    const opening = Boolean(selected);
    if (opening && sheetOpen.current) {
      el.style.transform = "translateY(0)";
      return;
    }
    if (!opening && !sheetOpen.current) return;
    if (prefersReducedMotion()) {
      el.style.transform = opening ? "translateY(0)" : "translateY(100%)";
      sheetOpen.current = opening;
      if (!opening) setSheet(null);
      return;
    }
    let cancelled = false;
    if (opening) {
      sheetOpen.current = true;
      el.style.transform = "translateY(100%)";
      void tween(
        320,
        (t) => {
          el.style.transform = `translateY(${(1 - easeOutCubic(t)) * 100}%)`;
        },
        () => cancelled,
      ).then(() => {
        if (!cancelled) el.style.transform = "translateY(0)";
      });
    } else {
      void tween(
        240,
        (t) => {
          el.style.transform = `translateY(${easeOutCubic(t) * 100}%)`;
        },
        () => cancelled,
      ).then(() => {
        if (cancelled) return;
        sheetOpen.current = false;
        setSheet(null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [selected, sheet]);

  function selectObservation(obs: Observation) {
    const map = mapRef.current;
    if (!map || !hasValidCoords(obs.lat, obs.lng)) return;
    setSelected(obs);
    markersRef.current.forEach((m) => {
      const el = m.getElement();
      el.classList.toggle("is-selected", el.dataset.obsId === obs.id);
    });
  }

  function paintMarkers(observations: Observation[]) {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    for (const obs of observations) {
      if (!hasValidCoords(obs.lat, obs.lng)) continue;
      const lat = obs.lat as number;
      const lng = obs.lng as number;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-dot";
      el.dataset.obsId = obs.id;
      el.setAttribute("aria-label", obsTitle(obs));
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
      map.fitBounds(bounds, { padding: 48, maxZoom: AUTO_FIT_MAX_ZOOM, duration: 0 });
    }
  }

  const empty = loaded && !error && count === 0 && !selected;

  return (
    <div className="page-map">
      <div className="map-wrap" ref={containerRef} />
      {empty ? <p className="map-empty">{t("map.empty")}</p> : null}
      {error ? <p className="map-empty error">{error}</p> : null}
      {sheet ? (
        <div className="map-sheet" ref={sheetRef}>
          <Link className="map-sheet-main" to={obsHref(sheet)} aria-label={t("map.openDetail")}>
            <img className="map-sheet-thumb" src={sheet.displayUrl} alt="" />
            <span className="map-sheet-copy">
              <strong>{obsTitle(sheet)}</strong>
              <span className="muted">
                {sheet.locationLabel ||
                  `${sheet.lat?.toFixed(5)}, ${sheet.lng?.toFixed(5)}`}
              </span>
            </span>
          </Link>
          <Link className="btn secondary" to={`/trips/${sheet.tripId}`}>
            {t("map.openTrip")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
