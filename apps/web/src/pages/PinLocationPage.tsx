import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { t } from "@biotrace/messages";
import { useBackClose } from "../androidBack";
import { api } from "../api";
import { hasValidCoords } from "../geo";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  PIN_EXISTING_ZOOM,
  USER_MAX_ZOOM,
  attachBasemapFallback,
  fetchTiandituKeys,
  mapStyleForKeys,
} from "../map/style";

export default function PinLocationPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  useBackClose(() => navigate(`/observations/${id}`));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [centerLabel, setCenterLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    let detachFallback: (() => void) | undefined;
    let map: Map | null = null;

    async function boot() {
      try {
        const [{ observation }, keys] = await Promise.all([
          api.getObservation(id),
          fetchTiandituKeys(),
        ]);
        if (cancelled || !containerRef.current) return;

        const hasPoint = hasValidCoords(observation.lat, observation.lng);
        const center: [number, number] = hasPoint
          ? [observation.lng!, observation.lat!]
          : DEFAULT_MAP_CENTER;
        const zoom = hasPoint ? PIN_EXISTING_ZOOM : DEFAULT_MAP_ZOOM;

        map = new maplibregl.Map({
          container: containerRef.current,
          style: mapStyleForKeys(keys),
          center,
          zoom,
          maxZoom: USER_MAX_ZOOM,
        });
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
        detachFallback = attachBasemapFallback(map, keys);

        const refreshCenter = () => {
          const c = map!.getCenter();
          setCenterLabel(`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
        };
        map.on("load", () => {
          refreshCenter();
          if (!cancelled) setMapReady(true);
        });
        map.on("move", refreshCenter);

        mapRef.current = map;
        map.resize();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("detail.loadFailed"));
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
      detachFallback?.();
      map?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [id]);

  async function confirmHere() {
    const map = mapRef.current;
    if (!map || saving) return;
    const { lat, lng } = map.getCenter();
    setSaving(true);
    setError(null);
    try {
      await api.setObservationLocation(id, lat, lng);
      navigate(`/observations/${id}`, { replace: true, state: { locationSaved: true } });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("detail.locationSaveFailed"));
      setSaving(false);
    }
  }

  return (
    <div className="pin-page">
      <Link className="text-link pin-back" to={`/observations/${id}`}>
        ← {t("detail.pinCancel")}
      </Link>

      <div className="map-wrap map-wrap-pin">
        <div ref={containerRef} className="map-pin-canvas" />
        <div className="map-pin-crosshair" aria-hidden="true">
          <span className="map-pin-crosshair-dot" />
        </div>
      </div>

      <div className="pin-dock">
        <p className="muted pin-lede">{t("detail.pinLede")}</p>
        {centerLabel ? <p className="muted pin-center-label">{centerLabel}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" type="button" disabled={!mapReady || saving} onClick={confirmHere}>
          {saving ? t("detail.pinSaving") : t("detail.pinConfirm")}
        </button>
      </div>
    </div>
  );
}
