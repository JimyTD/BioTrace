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

/** 把盒子写进元素。飞行体是 fixed 定位的，所以直接写 left/top/宽高 */
export function applyBox(el: HTMLElement, box: MotionBox) {
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
}

export function mixBox(a: MotionBox, b: MotionBox, t: number): MotionBox {
  return {
    left: lerp(a.left, b.left, t),
    top: lerp(a.top, b.top, t),
    width: lerp(a.width, b.width, t),
    height: lerp(a.height, b.height, t),
  };
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
