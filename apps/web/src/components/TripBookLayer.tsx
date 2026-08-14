import {
  createContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function contentBox(): OpenBookBox {
  const el = document.querySelector("main.content");
  if (el) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
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

function applyBox(el: HTMLElement, box: OpenBookBox) {
  el.style.position = "absolute";
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
}

function boxStyle(box: OpenBookBox): CSSProperties {
  return {
    position: "fixed",
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
  };
}

function boxKeyframes(from: OpenBookBox, to: OpenBookBox, extra: Keyframe = {}): [Keyframe, Keyframe] {
  return [
    {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      ...extra,
    },
    {
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      ...extra,
    },
  ];
}

async function play(el: Element, keyframes: Keyframe[], duration: number, easing: string) {
  const anim = el.animate(keyframes, { duration, easing, fill: "forwards" });
  try {
    await anim.finished;
    anim.commitStyles();
  } catch {
    /* cancelled */
  } finally {
    anim.cancel();
  }
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
  const [phase, setPhase] = useState<Phase>(origin && !prefersReducedMotion() ? "opening" : "open");
  const [stage] = useState(contentBox);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const matRef = useRef<HTMLDivElement | null>(null);
  const generation = useRef(0);

  const fromBox = useMemo(
    () => (origin ? localBox(origin.source, stage) : null),
    [origin, stage],
  );
  const heldBox = useMemo(
    () => (fromBox ? heldAt(fromBox, stage) : null),
    [fromBox, stage],
  );
  const canAnimate = Boolean(origin && fromBox && heldBox && !prefersReducedMotion());

  function requestClose() {
    if (phase === "closing") return;
    if (!canAnimate || phase !== "open") {
      navigate("/");
      return;
    }
    setPhase("closing");
  }

  useLayoutEffect(() => {
    const main = document.querySelector("main.content");
    main?.classList.add("is-book-open");
    if (!canAnimate) {
      document.querySelector(".page-trips")?.classList.add("is-book-back");
    }
    return () => {
      main?.classList.remove("is-book-open");
      document.querySelector(".page-trips")?.classList.remove("is-book-back");
    };
  }, [canAnimate]);

  useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const cover = coverRef.current;
    const pages = pagesRef.current;
    const mat = matRef.current;
    const shelf = document.querySelector(".page-trips");
    if (!cover || !pages || !mat || !fromBox || !heldBox) {
      setPhase("open");
      return;
    }

    const coverEl = cover;
    const pagesEl = pages;
    const matEl = mat;
    const from = fromBox;
    const held = heldBox;
    const gen = ++generation.current;
    let cancelled = false;

    async function runOpen() {
      applyBox(coverEl, from);
      coverEl.style.transform = "rotateY(0deg)";
      matEl.style.opacity = "0";
      pagesEl.style.opacity = "0";
      pagesEl.style.filter = "blur(16px)";
      void play(matEl, [{ opacity: 0 }, { opacity: 1 }], 240, "ease-out");
      if (shelf) {
        void play(
          shelf,
          [
            { filter: "blur(0px)", transform: "scale(1)" },
            { filter: "blur(12px)", transform: "scale(1.06)" },
          ],
          280,
          "ease-out",
        );
      }
      const lifted = { ...from, top: from.top - 14 };
      await play(
        coverEl,
        boxKeyframes(from, lifted, { transform: "rotateY(0deg)" }),
        140,
        "cubic-bezier(0.22, 1, 0.36, 1)",
      );
      if (cancelled || gen !== generation.current) return;
      await play(
        coverEl,
        boxKeyframes(lifted, held, { transform: "rotateY(0deg)" }),
        300,
        "cubic-bezier(0.22, 1, 0.36, 1)",
      );
      if (cancelled || gen !== generation.current) return;
      applyBox(coverEl, held);
      coverEl.style.transform = "rotateY(0deg)";
      document.querySelector(".page-trips")?.classList.add("is-book-back");
      void play(
        pagesEl,
        [
          { opacity: 0, filter: "blur(16px)" },
          { opacity: 1, filter: "blur(16px)" },
        ],
        240,
        "ease-out",
      );
      await play(
        coverEl,
        [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-95deg)" }],
        520,
        "cubic-bezier(0.45, 0.02, 0.2, 1)",
      );
      if (cancelled || gen !== generation.current) return;
      coverEl.style.transform = "rotateY(-95deg)";
      matEl.style.opacity = "1";
      pagesEl.style.opacity = "1";
      await play(
        pagesEl,
        [
          { opacity: 1, filter: "blur(16px)" },
          { opacity: 1, filter: "blur(0px)" },
        ],
        480,
        "cubic-bezier(0.22, 1, 0.36, 1)",
      );
      if (cancelled || gen !== generation.current) return;
      pagesEl.style.filter = "blur(0px)";
      setPhase("open");
    }

    async function runClose() {
      applyBox(coverEl, held);
      coverEl.style.transform = "rotateY(-95deg)";
      matEl.style.opacity = "1";
      pagesEl.style.opacity = "1";
      pagesEl.style.filter = "blur(0px)";
      void play(
        pagesEl,
        [
          { opacity: 1, filter: "blur(0px)" },
          { opacity: 1, filter: "blur(16px)" },
        ],
        220,
        "ease-in",
      );
      await play(
        coverEl,
        [{ transform: "rotateY(-95deg)" }, { transform: "rotateY(0deg)" }],
        380,
        "cubic-bezier(0.45, 0.02, 0.2, 1)",
      );
      if (cancelled || gen !== generation.current) return;
      coverEl.style.transform = "rotateY(0deg)";
      void play(
        pagesEl,
        [
          { opacity: 1, filter: "blur(16px)" },
          { opacity: 0, filter: "blur(16px)" },
        ],
        160,
        "ease-in",
      );
      if (shelf) {
        shelf.classList.remove("is-book-back");
        void play(
          shelf,
          [
            { filter: "blur(12px)", transform: "scale(1.06)" },
            { filter: "blur(0px)", transform: "scale(1)" },
          ],
          260,
          "ease-out",
        );
      }
      await play(
        coverEl,
        boxKeyframes(held, from, { transform: "rotateY(0deg)" }),
        280,
        "cubic-bezier(0.4, 0, 0.2, 1)",
      );
      if (cancelled || gen !== generation.current) return;
      await play(matEl, [{ opacity: 1 }, { opacity: 0 }], 160, "ease-in");
      if (cancelled || gen !== generation.current) return;
      navigate("/");
    }

    void (phase === "opening" ? runOpen() : runClose());
    return () => {
      cancelled = true;
      coverEl.getAnimations().forEach((a) => a.cancel());
      pagesEl.getAnimations().forEach((a) => a.cancel());
      matEl.getAnimations().forEach((a) => a.cancel());
    };
  }, [phase, fromBox, heldBox, navigate]);

  if (typeof document === "undefined") return null;

  return (
    <OpenBookCloseContext.Provider value={requestClose}>
      {createPortal(
        <div
          className={`trip-book-layer is-${phase}`}
          style={boxStyle(stage)}
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
        </div>,
        document.body,
      )}
    </OpenBookCloseContext.Provider>
  );
}
