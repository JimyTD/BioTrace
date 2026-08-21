import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { t, type MessageKey } from "@biotrace/messages";
import { paintOnboardBasemap, projectOnboardLngLat } from "../onboardBasemap";
import { prefersReducedMotion } from "../motion";
import PageOverlay from "../PageOverlay";
import { tripCoverFrameUrl, volumeStampFrameUrl } from "../themes";

const SAMPLE_PHOTO = "/trips/_sample-photo.jpg";

const PAGES: { tab: "trips" | "map" | "collection"; ledeKey: MessageKey }[] = [
  { tab: "trips", ledeKey: "onboard.tripLede" },
  { tab: "map", ledeKey: "onboard.mapLede" },
  { tab: "collection", ledeKey: "onboard.collectionLede" },
];

const MAP_DOTS = [
  { lng: 104.06, lat: 30.67, on: false },
  { lng: 113.26, lat: 23.13, on: false },
  { lng: 121.47, lat: 31.23, on: true },
];

export default function OnboardInsert({
  mode,
  onClose,
}: {
  mode: "first" | "replay";
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const folioRef = useRef<HTMLDivElement | null>(null);
  const current = PAGES[page]!;
  const last = page === PAGES.length - 1;

  useEffect(() => {
    const shell = document.querySelector(".app-shell");
    shell?.classList.add("is-onboard");
    return () => {
      shell?.classList.remove("is-onboard");
      shell?.removeAttribute("data-onboard-tab");
    };
  }, []);

  useEffect(() => {
    document.querySelector(".app-shell")?.setAttribute("data-onboard-tab", current.tab);
  }, [current.tab]);

  function finish() {
    onClose();
    if (mode === "replay") navigate("/me", { replace: true });
    else if (last) navigate("/", { replace: true });
  }

  async function fadeTo(next: () => void) {
    if (busy) return;
    setBusy(true);
    const el = folioRef.current;
    const reduced = prefersReducedMotion();
    if (el && !reduced) {
      const a = el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 180,
        easing: "ease-in",
        fill: "forwards",
      });
      await a.finished.catch(() => undefined);
      a.cancel();
    }
    next();
    if (el && !reduced && !el.classList.contains("is-gone")) {
      const b = el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 280,
        easing: "ease-out",
      });
      await b.finished.catch(() => undefined);
    }
    if (el) el.style.opacity = "";
    setBusy(false);
  }

  function advance() {
    if (last) {
      void fadeTo(finish);
      return;
    }
    void fadeTo(() => setPage((n) => n + 1));
  }

  const turnLabel = last && mode === "first" ? t("trips.createLabel") : t("onboard.turn");

  return (
    <PageOverlay className="is-onboard">
      <div
        className={`onboard-folio${current.tab === "map" ? " is-map" : ""}`}
        ref={folioRef}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(".onboard-skip")) return;
          advance();
        }}
      >
        <div className="onboard-mast">
          {current.tab === "trips" ? <OnboardCover /> : null}
          {current.tab === "map" ? <OnboardMap /> : null}
          {current.tab === "collection" ? <OnboardStamp /> : null}
        </div>
        <div className="onboard-colophon">
          <p className="onboard-lede">{t(current.ledeKey)}</p>
          <div className="onboard-rule" aria-hidden />
          <div className="onboard-actions">
            <button
              className="text-link onboard-skip"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void fadeTo(finish);
              }}
            >
              {t("onboard.skip")}
            </button>
            <button
              className={last && mode === "first" ? "btn" : "text-link"}
              type="button"
            >
              {turnLabel}
            </button>
          </div>
        </div>
      </div>
    </PageOverlay>
  );
}

function OnboardCover() {
  return (
    <div className="onboard-cover">
      <div className="onboard-cover-window">
        <img src={SAMPLE_PHOTO} alt="" />
      </div>
      <img className="onboard-cover-frame" src={tripCoverFrameUrl()} alt="" aria-hidden />
    </div>
  );
}

function OnboardStamp() {
  return (
    <div className="onboard-stamp">
      <div className="onboard-stamp-photo">
        <img src={SAMPLE_PHOTO} alt="" />
      </div>
      <img className="onboard-stamp-frame" src={volumeStampFrameUrl()} alt="" aria-hidden />
    </div>
  );
}

function OnboardMap() {
  const foldRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const fold = foldRef.current;
    const canvas = canvasRef.current;
    if (!fold || !canvas) return;
    let cancelled = false;

    const placeDots = () => {
      const w = fold.clientWidth;
      const h = fold.clientHeight;
      fold.querySelectorAll<HTMLElement>(".onboard-map-dot").forEach((el) => {
        const lng = Number(el.dataset.lng);
        const lat = Number(el.dataset.lat);
        const [x, y] = projectOnboardLngLat(lng, lat, w, h);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      });
    };

    const draw = () => {
      void paintOnboardBasemap(canvas, fold).then(() => {
        if (!cancelled) placeDots();
      });
    };

    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="onboard-map" ref={foldRef}>
      <canvas className="onboard-basemap" ref={canvasRef} aria-hidden />
      <span className="onboard-map-attrib">{t("map.simpleBasemapAttribution")}</span>
      {MAP_DOTS.map((dot) => (
        <i
          className={`onboard-map-dot${dot.on ? " is-on" : ""}`}
          key={`${dot.lng},${dot.lat}`}
          data-lng={dot.lng}
          data-lat={dot.lat}
        />
      ))}
    </div>
  );
}
