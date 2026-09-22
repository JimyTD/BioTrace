import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { t } from "@biotrace/messages";
import { bookmarkReel, reconcileReelPosition, reelWindow, restoreReel, wrapIndex, type ReelEntry } from "../collectionReel";

const SPEED = 14;
const INSET = 22;

function readBookmark(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

type Drag = { id: number; x: number; y: number; position: number; horizontal: boolean };

export function CollectionReel<T extends ReelEntry>({ items, storageKey, renderItem, reducedMotion = false, allHref = "/collection/species", onNavigate }: {
  items: readonly T[];
  storageKey: string;
  renderItem: (item: T, index: number) => ReactNode;
  reducedMotion?: boolean;
  allHref?: string;
  onNavigate?: () => void;
}) {
  const [initial] = useState(() => restoreReel(items, readBookmark(storageKey)));
  const position = useRef(initial.position);
  const previousItems = useRef(items);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const renderedBase = useRef(Math.floor(initial.position));
  const requestedBase = useRef(renderedBase.current);
  const [base, setBase] = useState(renderedBase.current);
  const [geometry, setGeometry] = useState({ width: 350, step: 162, gap: 18 });
  const [paused, setPaused] = useState(initial.paused);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [prefersReduced, setPrefersReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const reduced = reducedMotion || prefersReduced;
  const canMove = items.length > 1 && items.length * geometry.step - geometry.gap > geometry.width - 2 * INSET;
  const running = canMove && !paused && !reduced && !hovered && !focused && !holding && inView && pageVisible;
  const live = useRef({ running, paused, canMove, geometry, items, storageKey });
  live.current = { running, paused, canMove, geometry, items, storageKey };
  const drag = useRef<Drag | null>(null);
  const suppressClickUntil = useRef(0);

  function save() {
    const current = live.current;
    const bookmark = bookmarkReel(current.items, position.current, current.paused);
    if (!bookmark) return;
    try { localStorage.setItem(current.storageKey, JSON.stringify(bookmark)); } catch { /* Storage may be disabled. */ }
  }

  function paint() {
    const current = live.current;
    if (!track.current) return;
    // Keep the transform relative to the committed window until React recycles a slot.
    const x = current.canMove ? INSET - (position.current - renderedBase.current + 1) * current.geometry.step : 0;
    track.current.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  function moveTo(next: number) {
    if (!live.current.canMove) return;
    position.current = next;
    const nextBase = Math.floor(next);
    if (requestedBase.current !== nextBase) {
      requestedBase.current = nextBase;
      setBase(nextBase);
    }
    paint();
  }

  function step(direction: number) {
    setPaused(true);
    live.current.paused = true;
    moveTo(Math.floor(position.current + .001) + direction);
    save();
  }

  useLayoutEffect(() => {
    if (previousItems.current === items) return;
    const next = reconcileReelPosition(previousItems.current, items, position.current);
    previousItems.current = items;
    position.current = next;
    requestedBase.current = Math.floor(next);
    setBase(requestedBase.current);
    drag.current = null;
    setHolding(false);
  }, [items]);

  useLayoutEffect(() => {
    renderedBase.current = base;
    paint();
  }, [base, geometry, canMove]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const cardWidth = parseFloat(style.getPropertyValue("--reel-card-width"));
      const gap = parseFloat(style.getPropertyValue("--reel-gap"));
      setGeometry({ width: element.clientWidth, step: cardWidth + gap, gap });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items.length > 0]);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const changeMotion = () => setPrefersReduced(media.matches);
    const changeVisibility = () => { setPageVisible(!document.hidden); save(); };
    media.addEventListener("change", changeMotion);
    document.addEventListener("visibilitychange", changeVisibility);
    window.addEventListener("pagehide", save);
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: .1 });
    if (viewport.current) observer.observe(viewport.current);
    return () => {
      media.removeEventListener("change", changeMotion);
      document.removeEventListener("visibilitychange", changeVisibility);
      window.removeEventListener("pagehide", save);
      observer.disconnect();
    };
  }, [items.length > 0]);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = 0;
    let lastSave = 0;
    function animate(now: number) {
      const dt = last ? Math.min((now - last) / 1000, .05) : 0;
      last = now;
      if (live.current.running && !drag.current) {
        position.current += SPEED * dt / live.current.geometry.step;
        const nextBase = Math.floor(position.current);
        if (requestedBase.current !== nextBase) {
          requestedBase.current = nextBase;
          setBase(nextBase);
        }
        paint();
        if (now - lastSave > 3000) { save(); lastSave = now; }
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); save(); };
  }, [running]);

  useEffect(() => () => save(), []);

  useEffect(() => {
    const release = (event: globalThis.PointerEvent) => {
      if (drag.current?.id !== event.pointerId) return;
      if (drag.current.horizontal) suppressClickUntil.current = performance.now() + 300;
      drag.current = null;
      setHolding(false);
      save();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || !canMove) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, position: position.current, horizontal: false };
    setHolding(true);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      gesture.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (gesture.horizontal) {
      event.preventDefault();
      moveTo(gesture.position - dx / geometry.step);
    }
  }

  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    if (drag.current.horizontal) suppressClickUntil.current = performance.now() + 300;
    drag.current = null;
    setHolding(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    save();
  }

  const slots = canMove ? reelWindow(base, items.length, geometry.width, geometry.step) : items.map((_, index) => ({ index, logical: index, overscan: false }));
  const selected = canMove ? wrapIndex(base, items.length) : 0;

  if (!items.length) return <p className="collection-empty">{t("collection.empty")}</p>;
  return <section className="collection-reel" aria-label={t("collection.reelLabel")} data-running={running}>
    <div
      ref={viewport}
      className={`reel-window${canMove ? " is-movable" : " is-static"}`}
      tabIndex={0}
      role="region"
      aria-label={t("collection.reelLabel")}
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onLostPointerCapture={pointerEnd}
      onDragStart={event => event.preventDefault()}
      onClickCapture={event => { if (performance.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
      onFocusCapture={event => {
        const target = event.target as HTMLElement;
        setFocused(target.matches(":focus-visible"));
      }}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          event.currentTarget.scrollLeft = 0;
        }
      }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); event.currentTarget.focus(); step(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <span className="reel-rail is-top" aria-hidden="true" />
      <div ref={track} className="reel-track">
        {slots.map(slot => <div className="reel-slot" key={slot.logical} data-logical={slot.logical} aria-hidden={slot.overscan || undefined} inert={slot.overscan || undefined}>
          {renderItem(items[slot.index]!, slot.index)}
        </div>)}
      </div>
      <span className="reel-rail is-bottom" aria-hidden="true" />
    </div>
    <div className="reel-footer">
      <output className="reel-position" aria-live="off">{t("collection.reelPosition", { current: selected + 1, total: items.length })}</output>
      <div className="reel-buttons" role="group" aria-label={t("collection.reelLabel")}>
        <button type="button" disabled={!canMove} title={t("collection.reelPrevious")} aria-label={t("collection.reelPrevious")} onClick={() => step(-1)}><span aria-hidden="true">←</span></button>
        <button type="button" className="reel-play" disabled={!canMove || reduced} title={t(paused || reduced || !canMove ? "collection.reelPlay" : "collection.reelPause")} aria-label={t(paused || reduced || !canMove ? "collection.reelPlay" : "collection.reelPause")} onClick={() => { const next = !live.current.paused; live.current.paused = next; setPaused(next); save(); }}><span aria-hidden="true">{paused || reduced || !canMove ? "▶" : "Ⅱ"}</span></button>
        <button type="button" disabled={!canMove} title={t("collection.reelNext")} aria-label={t("collection.reelNext")} onClick={() => step(1)}><span aria-hidden="true">→</span></button>
      </div>
      <Link className="reel-all" to={allHref} onClick={onNavigate}>{t("collection.speciesFilterAll")} <span aria-hidden="true">↗</span></Link>
    </div>
  </section>;
}
