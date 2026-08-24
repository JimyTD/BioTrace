import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { t, type MessageKey } from "@biotrace/messages";
import { useBackClose } from "../androidBack";
import { paintOnboardBasemap, prefetchOnboardBasemap, projectOnboardLngLat } from "../onboardBasemap";
import { prefersReducedMotion } from "../motion";
import PageOverlay from "../PageOverlay";
import { tripCoverFrameUrl, volumeStampFrameUrl } from "../themes";

const SAMPLE_PHOTO = "/trips/_sample-photo.jpg";

const PAGES: { tab: "trips" | "map" | "collection"; ledeKey: MessageKey }[] = [
  { tab: "trips", ledeKey: "onboard.tripLede" },
  { tab: "map", ledeKey: "onboard.mapLede" },
  { tab: "collection", ledeKey: "onboard.collectionLede" },
];

const LAST = PAGES.length - 1;

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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const closedRef = useRef(false);
  const pageRef = useRef(0);
  const modeRef = useRef(mode);
  const onCloseRef = useRef(onClose);
  const dragRef = useRef<{
    pid: number;
    x: number;
    y: number;
    t: number;
    axis: "h" | "v" | null;
  } | null>(null);
  const swallowClickRef = useRef(false);
  const leavingRef = useRef(false);
  pageRef.current = page;
  modeRef.current = mode;
  onCloseRef.current = onClose;

  useEffect(() => {
    const shell = document.querySelector(".app-shell");
    shell?.classList.add("is-onboard");
    prefetchOnboardBasemap();
    return () => {
      shell?.classList.remove("is-onboard");
      shell?.removeAttribute("data-onboard-tab");
    };
  }, []);

  useEffect(() => {
    document.querySelector(".app-shell")?.setAttribute("data-onboard-tab", PAGES[page]!.tab);
  }, [page]);

  useLayoutEffect(() => {
    paintTrack(page, 0, false);
    const onResize = () => paintTrack(pageRef.current, 0, false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (window.history.state?.biotraceOnboard !== true) {
      window.history.pushState({ biotraceOnboard: true }, "");
    }
    const onPop = () => {
      if (closedRef.current) return;
      if (pageRef.current > 0) {
        window.history.pushState({ biotraceOnboard: true }, "");
      }
      retreat(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useBackClose(() => retreat(), true, 40);

  function paneWidth() {
    return trackRef.current?.parentElement?.clientWidth || 1;
  }

  function paintTrack(index: number, dx: number, animate: boolean) {
    const el = trackRef.current;
    if (!el) return;
    const w = paneWidth();
    const reduced = prefersReducedMotion();
    el.style.transition = animate && !reduced ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    el.style.transform = `translate3d(${-index * w + dx}px, 0, 0)`;
  }

  function slideAway(dir: 1 | -1, then: () => void) {
    if (leavingRef.current || closedRef.current) return;
    leavingRef.current = true;
    if (prefersReducedMotion()) {
      then();
      return;
    }
    paintTrack(pageRef.current, dir * paneWidth(), true);
    window.setTimeout(then, 280);
  }

  function finish(fromPop = false) {
    if (closedRef.current) return;
    closedRef.current = true;
    if (!fromPop && window.history.state?.biotraceOnboard === true) {
      if (modeRef.current === "replay" || pageRef.current === LAST) {
        window.history.replaceState(null, "");
      } else {
        window.history.back();
      }
    }
    onCloseRef.current();
    if (modeRef.current === "replay") navigate("/me", { replace: true });
    else if (pageRef.current === LAST) navigate("/", { replace: true });
  }

  function goTo(next: number) {
    const index = Math.max(0, Math.min(LAST, next));
    pageRef.current = index;
    setPage(index);
    paintTrack(index, 0, true);
  }

  function retreat(fromPop = false) {
    if (closedRef.current || leavingRef.current) return;
    if (pageRef.current > 0) {
      goTo(pageRef.current - 1);
      return;
    }
    finish(fromPop);
  }

  function advance() {
    if (leavingRef.current || closedRef.current) return;
    if (pageRef.current >= LAST) {
      finish();
      return;
    }
    goTo(pageRef.current + 1);
  }

  function onTrackPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    dragRef.current = { pid: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, axis: null };
  }

  function onTrackPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      drag.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (drag.axis === "h") trackRef.current?.setPointerCapture(e.pointerId);
    }
    if (drag.axis !== "h") return;
    e.preventDefault();
    paintTrack(pageRef.current, dx, false);
  }

  function onTrackPointerUp(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pid !== e.pointerId) return;
    if (drag.axis !== "h") {
      paintTrack(pageRef.current, 0, true);
      return;
    }
    swallowClickRef.current = true;
    window.setTimeout(() => {
      swallowClickRef.current = false;
    }, 0);
    const dx = e.clientX - drag.x;
    const dt = Math.max(16, e.timeStamp - drag.t);
    const v = dx / dt;
    const w = paneWidth();
    const goNext = v < -0.35 || dx < -w * 0.18;
    const goPrev = v > 0.35 || dx > w * 0.18;
    if (goNext) {
      if (pageRef.current < LAST) goTo(pageRef.current + 1);
      else slideAway(-1, () => finish());
    } else if (goPrev) {
      if (pageRef.current > 0) goTo(pageRef.current - 1);
      else slideAway(1, () => finish());
    } else {
      paintTrack(pageRef.current, 0, true);
    }
  }

  function onTrackClickCapture(e: MouseEvent<HTMLDivElement>) {
    if (!swallowClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    swallowClickRef.current = false;
  }

  return (
    <PageOverlay className="is-onboard">
      <div
        className="onboard-track"
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={onTrackPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          paintTrack(pageRef.current, 0, true);
        }}
        onClickCapture={onTrackClickCapture}
      >
        {PAGES.map((item, index) => (
          <OnboardFolio
            key={item.tab}
            tab={item.tab}
            ledeKey={item.ledeKey}
            last={index === LAST}
            mode={mode}
            onAdvance={advance}
            onSkip={() => finish()}
          />
        ))}
      </div>
    </PageOverlay>
  );
}

function OnboardFolio({
  tab,
  ledeKey,
  last,
  mode,
  onAdvance,
  onSkip,
}: {
  tab: "trips" | "map" | "collection";
  ledeKey: MessageKey;
  last: boolean;
  mode: "first" | "replay";
  onAdvance: () => void;
  onSkip: () => void;
}) {
  return (
    <div className={`onboard-folio${tab === "map" ? " is-map" : ""}`}>
      <div className="onboard-mast" onClick={onAdvance}>
        {tab === "trips" ? <OnboardCover /> : null}
        {tab === "map" ? <OnboardMap /> : null}
        {tab === "collection" ? <OnboardStamp /> : null}
      </div>
      <div className="onboard-colophon">
        <p className="onboard-lede" onClick={onAdvance}>
          {t(ledeKey)}
        </p>
        <div className="onboard-rule" aria-hidden onClick={onAdvance} />
        <div className={`onboard-actions${last ? " is-done" : ""}`}>
          {last ? null : (
            <button
              className="text-link onboard-skip"
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onSkip();
              }}
            >
              {t("onboard.skip")}
            </button>
          )}
          <button
            className={last ? "btn" : "text-link"}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onAdvance}
          >
            {last ? (mode === "replay" ? t("me.back") : t("onboard.done")) : t("onboard.turn")}
          </button>
        </div>
      </div>
    </div>
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
