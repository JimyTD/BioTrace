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
import { easeOutCubic, tween } from "../motion";
import { tripCoverFrameUrl } from "../themes";
import { themeSlot } from "../themes/slots";

export const OpenBookCloseContext = createContext<(() => void) | null>(null);

type Phase = "opening" | "open" | "closing";

type Props = {
  tripId: string;
  children: ReactNode;
};

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

function clearShelfLook(shelf: Element | null) {
  if (!(shelf instanceof HTMLElement)) return;
  shelf.classList.remove("is-book-back");
  shelf.style.filter = "";
  shelf.style.webkitFilter = "";
  shelf.style.transform = "";
}

/** 故意不走 motion.ts 的 measureBox：那个会对齐设备像素，这儿对齐了封面就跳一下 */
function measure(el: Element): OpenBookBox {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function CoverClone({ coverUrl }: { coverUrl: string | null }) {
  return (
    /* 飞起来的那张就是列表封面的复制品，零件和栅格必须跟 TripsPage 一致 */
    <div className="trip-cover-slot">
      <div className="trip-cover">
        <span className="trip-cover-media" aria-hidden />
        <span className="trip-cover-window">
          {coverUrl ? (
            <img className="trip-cover-photo" src={coverUrl} alt="" />
          ) : (
            <span className="trip-cover-placeholder" aria-hidden />
          )}
        </span>
        <img className="trip-cover-frame" src={tripCoverFrameUrl()} alt="" aria-hidden />
      </div>
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
    const shelfEl = document.querySelector(".page-trips");
    const shelf = shelfEl instanceof HTMLElement ? shelfEl : null;
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

    // 摆法归皮肤，图层归这儿。没有封面克隆体（直接进的相册，没走列表）时
    // 没得可演，退化成直接就位——这条退化路径是骨架的事，不交给皮肤
    const playAlbum = themeSlot("album");
    const beat =
      cover && from && held
        ? { cover, pages: pagesEl, scrim: matEl, shelf, from, held, cancelled: isCancelled }
        : null;

    async function runOpen() {
      if (!beat) {
        matEl.style.opacity = "1";
        pagesEl.style.opacity = "1";
        pagesEl.style.filter = "none";
        pagesEl.style.webkitFilter = "none";
        clearOpenBookHandoff();
        setPhase("open");
        return;
      }
      await playAlbum({ ...beat, dir: "open" });
      if (isCancelled()) return;
      clearOpenBookHandoff();
      setPhase("open");
    }

    async function runClose() {
      pagesEl.style.opacity = "1";
      matEl.style.opacity = "1";
      if (beat) {
        await playAlbum({ ...beat, dir: "close" });
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
