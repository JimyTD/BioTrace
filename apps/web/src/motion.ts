export type MotionBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

export function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function snapBox(box: MotionBox): MotionBox {
  const dpr = window.devicePixelRatio || 1;
  const snap = (n: number) => Math.round(n * dpr) / dpr;
  return {
    left: snap(box.left),
    top: snap(box.top),
    width: snap(box.width),
    height: snap(box.height),
  };
}

export function measureBox(el: Element): MotionBox {
  const r = el.getBoundingClientRect();
  return snapBox({ left: r.left, top: r.top, width: r.width, height: r.height });
}

export function tween(
  duration: number,
  onUpdate: (t: number) => void,
  cancelled?: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      if (cancelled?.()) {
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

export function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
