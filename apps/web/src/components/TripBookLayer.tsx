import {
  createContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  takeOpenBookHandoff,
  type OpenBookBox,
  type OpenBookHandoff,
} from "../openBookHandoff";
import { tripCoverFrameUrl } from "../themes";

export const OpenBookCloseContext = createContext<(() => void) | null>(null);

type Phase = "opening" | "open" | "closing";

type Props = {
  tripId: string;
  children: ReactNode;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function localBox(src: OpenBookBox, dst: OpenBookBox): OpenBookBox {
  return {
    left: src.left - dst.left,
    top: src.top - dst.top,
    width: src.width,
    height: src.height,
  };
}

function heldAt(from: OpenBookBox, dst: OpenBookBox): OpenBookBox {
  return {
    left: (dst.width - from.width) / 2,
    top: (dst.height - from.height) / 2,
    width: from.width,
    height: from.height,
  };
}

function isAndroidWebView() {
  return (
    document.documentElement.dataset.webview === "android" ||
    /Android/i.test(navigator.userAgent)
  );
}

function pinLayer(layer: HTMLElement) {
  const main = document.querySelector("main.content");
  const r = (main ?? layer).getBoundingClientRect();
  layer.style.position = "fixed";
  layer.style.left = `${r.left}px`;
  layer.style.top = `${r.top}px`;
  layer.style.width = `${r.width}px`;
  layer.style.height = `${r.height}px`;
}

function applyBox(el: HTMLElement, box: OpenBookBox) {
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
}

function useFlatHinge() {
  return (
    isAndroidWebView() ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

function hingeCover(el: HTMLElement, opened: number) {
  if (useFlatHinge()) {
    el.style.transform = `scaleX(${lerp(1, 0.04, opened)})`;
    el.style.opacity = String(1 - opened * 0.35);
  } else {
    el.style.transform = `rotateY(${lerp(0, -95, opened)}deg)`;
  }
}

function measure(el: Element): OpenBookBox {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function tween(
  duration: number,
  onUpdate: (t: number) => void,
  cancelled: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      if (cancelled()) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / duration);
      onUpdate(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function CoverClone({ coverUrl }: { coverUrl: string | null }) {
  return (
    <div className="trip-cover-media">
      <div className="trip-cover-window">
        {coverUrl ? (
          <img className="trip-cover-photo" src={coverUrl} alt="" />
        ) : (
          <div className="trip-cover-placeholder" aria-hidden />
        )}
      </div>
      <img className="trip-cover-frame" src={tripCoverFrameUrl()} alt="" aria-hidden />
    </div>
  );
}

export default function TripBookLayer({ tripId, children }: Props) {
  const navigate = useNavigate();
  const [origin] = useState<OpenBookHandoff | null>(() => takeOpenBookHandoff(tripId));
  const [phase, setPhase] = useState<Phase>("opening");
  const layerRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const matRef = useRef<HTMLDivElement | null>(null);
  const generation = useRef(0);

  function requestClose() {
    if (phase === "closing") return;
    if (phase !== "open") {
      navigate("/");
      return;
    }
    setPhase("closing");
  }

  useLayoutEffect(() => {
    const main = document.querySelector("main.content");
    main?.classList.add("is-book-open");
    document.querySelector(".page-trips")?.classList.add("is-book-back");
    return () => {
      main?.classList.remove("is-book-open");
      document.querySelector(".page-trips")?.classList.remove("is-book-back");
    };
  }, []);

  useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const layer = layerRef.current;
    const pages = pagesRef.current;
    const mat = matRef.current;
    const cover = coverRef.current;
    const shelf = document.querySelector(".page-trips");
    if (!layer || !pages || !mat) {
      setPhase("open");
      return;
    }

    pinLayer(layer);
    const pagesEl = pages;
    const matEl = mat;
    const dst = measure(layer);
    const from = origin ? localBox(origin.source, dst) : null;
    const held = from ? heldAt(from, dst) : null;
    const gen = ++generation.current;
    let cancelled = false;
    const isCancelled = () => cancelled || gen !== generation.current;

    async function runOpen() {
      matEl.style.opacity = "0";
      pagesEl.style.opacity = "0";
      shelf?.classList.add("is-book-back");
      await tween(
        280,
        (t) => {
          matEl.style.opacity = String(easeOutCubic(t));
        },
        isCancelled,
      );
      if (isCancelled()) return;

      if (cover && from && held) {
        applyBox(cover, from);
        hingeCover(cover, 0);
        cover.style.opacity = "1";
        cover.style.visibility = "visible";
        const lifted = { ...from, top: from.top - 14 };
        await tween(
          160,
          (t) => {
            const e = easeOutCubic(t);
            applyBox(cover, {
              left: from.left,
              top: lerp(from.top, lifted.top, e),
              width: from.width,
              height: from.height,
            });
          },
          isCancelled,
        );
        if (isCancelled()) return;
        await tween(
          320,
          (t) => {
            const e = easeOutCubic(t);
            applyBox(cover, {
              left: lerp(lifted.left, held.left, e),
              top: lerp(lifted.top, held.top, e),
              width: from.width,
              height: from.height,
            });
          },
          isCancelled,
        );
        if (isCancelled()) return;
        applyBox(cover, held);
        await tween(
          520,
          (t) => {
            const e = easeInOut(t);
            hingeCover(cover, e);
            pagesEl.style.opacity = String(e);
          },
          isCancelled,
        );
        if (isCancelled()) return;
        hingeCover(cover, 1);
        cover.style.visibility = "hidden";
      } else {
        await tween(
          420,
          (t) => {
            pagesEl.style.opacity = String(easeOutCubic(t));
          },
          isCancelled,
        );
        if (isCancelled()) return;
      }

      const android = isAndroidWebView();
      await tween(
        android ? 220 : 480,
        (t) => {
          const e = easeOutCubic(t);
          pagesEl.style.opacity = "1";
          if (!android) {
            pagesEl.style.filter = `blur(${(1 - e) * 36}px)`;
          }
        },
        isCancelled,
      );
      if (isCancelled()) return;
      pagesEl.style.opacity = "1";
      pagesEl.style.filter = "none";
      matEl.style.opacity = "1";
      setPhase("open");
    }

    async function runClose() {
      pagesEl.style.opacity = "1";
      matEl.style.opacity = "1";
      if (cover && from && held) {
        applyBox(cover, held);
        cover.style.visibility = "visible";
        hingeCover(cover, 1);
        await tween(
          380,
          (t) => {
            const e = easeInOut(t);
            hingeCover(cover, 1 - e);
            pagesEl.style.opacity = String(1 - e);
          },
          isCancelled,
        );
        if (isCancelled()) return;
        hingeCover(cover, 0);
        pagesEl.style.opacity = "0";
        shelf?.classList.remove("is-book-back");
        await tween(
          280,
          (t) => {
            const e = easeInOut(t);
            applyBox(cover, {
              left: lerp(held.left, from.left, e),
              top: lerp(held.top, from.top, e),
              width: from.width,
              height: from.height,
            });
            matEl.style.opacity = String(1 - e);
          },
          isCancelled,
        );
      } else {
        await tween(
          280,
          (t) => {
            const e = easeOutCubic(t);
            pagesEl.style.opacity = String(1 - e);
            matEl.style.opacity = String(1 - e);
          },
          isCancelled,
        );
        shelf?.classList.remove("is-book-back");
      }
      if (isCancelled()) return;
      navigate("/");
    }

    void (phase === "opening" ? runOpen() : runClose());
    return () => {
      cancelled = true;
    };
  }, [phase, origin, navigate]);

  return (
    <OpenBookCloseContext.Provider value={requestClose}>
      <div
        className={`trip-book-layer is-${phase}`}
        ref={layerRef}
        aria-modal="true"
        role="dialog"
      >
        <div className="trip-book-mat" ref={matRef} />
        <div className="trip-book-pages" ref={pagesRef}>
          {children}
        </div>
        {origin ? (
          <div className="trip-book-cover" ref={coverRef} aria-hidden>
            <CoverClone coverUrl={origin.coverUrl} />
          </div>
        ) : null}
      </div>
    </OpenBookCloseContext.Provider>
  );
}
