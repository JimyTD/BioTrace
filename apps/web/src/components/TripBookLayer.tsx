import {
  createContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  clearOpenBookHandoff,
  peekOpenBookHandoff,
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

function hingeCover(el: HTMLElement, opened: number) {
  el.style.transform = `rotateY(${lerp(0, -95, opened)}deg)`;
}

function setBlur(el: HTMLElement, px: number) {
  const value = px <= 0.5 ? "none" : `blur(${px}px)`;
  el.style.filter = value;
  el.style.webkitFilter = value;
}

function clearShelfLook(shelf: Element | null) {
  if (!(shelf instanceof HTMLElement)) return;
  shelf.classList.remove("is-book-back");
  shelf.style.filter = "";
  shelf.style.webkitFilter = "";
  shelf.style.transform = "";
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
  const [origin] = useState<OpenBookHandoff | null>(() => peekOpenBookHandoff(tripId));
  const [phase, setPhase] = useState<Phase>(() => (origin ? "opening" : "open"));
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
    const layer = layerRef.current;
    if (layer) pinLayer(layer);
    const main = document.querySelector("main.content");
    const shelf = document.querySelector(".page-trips");
    main?.classList.add("is-book-open");
    shelf?.classList.add("is-book-back");
    if (!origin) clearShelfLook(shelf);
    if (shelf instanceof HTMLElement) shelf.classList.add("is-book-back");
    return () => {
      main?.classList.remove("is-book-open");
      clearShelfLook(document.querySelector(".page-trips"));
    };
  }, [origin]);

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
    if (phase === "opening") clearOpenBookHandoff();
    const pagesEl = pages;
    const matEl = mat;
    const dst = measure(layer);
    const from = origin ? localBox(origin.source, dst) : null;
    const held = from ? heldAt(from, dst) : null;
    const gen = ++generation.current;
    let cancelled = false;
    const isCancelled = () => cancelled || gen !== generation.current;

    async function runOpen() {
      if (!cover || !from || !held) {
        matEl.style.opacity = "1";
        pagesEl.style.opacity = "1";
        setBlur(pagesEl, 0);
        clearOpenBookHandoff();
        setPhase("open");
        return;
      }

      matEl.style.opacity = "0";
      pagesEl.style.opacity = "0";
      setBlur(pagesEl, 36);
      applyBox(cover, from);
      hingeCover(cover, 0);
      cover.style.opacity = "1";
      cover.style.visibility = "visible";
      shelf?.classList.add("is-book-back");
      if (shelf instanceof HTMLElement) {
        setBlur(shelf, 0);
        shelf.style.transform = "scale(1)";
      }
      await tween(
        280,
        (t) => {
          const e = easeOutCubic(t);
          matEl.style.opacity = String(e);
          if (shelf instanceof HTMLElement) {
            setBlur(shelf, e * 44);
            shelf.style.transform = `scale(${lerp(1, 1.14, e)})`;
          }
        },
        isCancelled,
      );
      if (isCancelled()) return;

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
          setBlur(pagesEl, (1 - e) * 36);
        },
        isCancelled,
      );
      if (isCancelled()) return;
      hingeCover(cover, 1);
      cover.style.visibility = "hidden";
      pagesEl.style.opacity = "1";
      setBlur(pagesEl, 0);
      matEl.style.opacity = "1";
      clearOpenBookHandoff();
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
            setBlur(pagesEl, e * 36);
          },
          isCancelled,
        );
        if (isCancelled()) return;
        hingeCover(cover, 0);
        pagesEl.style.opacity = "0";
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
            if (shelf instanceof HTMLElement) {
              setBlur(shelf, (1 - e) * 44);
              shelf.style.transform = `scale(${lerp(1.14, 1, e)})`;
            }
          },
          isCancelled,
        );
      } else {
        await tween(
          220,
          (t) => {
            const e = easeOutCubic(t);
            pagesEl.style.opacity = String(1 - e);
            matEl.style.opacity = String(1 - e);
          },
          isCancelled,
        );
      }
      clearShelfLook(shelf);
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
