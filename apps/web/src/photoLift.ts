import {
  easeOutCubic,
  lerp,
  nextPaint,
  prefersReducedMotion,
  snapBox,
  tween,
  type MotionBox,
} from "./motion";

function applyBox(el: HTMLElement, box: MotionBox) {
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
}

function mix(a: MotionBox, b: MotionBox, t: number): MotionBox {
  return {
    left: lerp(a.left, b.left, t),
    top: lerp(a.top, b.top, t),
    width: lerp(a.width, b.width, t),
    height: lerp(a.height, b.height, t),
  };
}

function makeFlyer(photoUrl: string) {
  const flyer = document.createElement("div");
  flyer.className = "photo-lift-flyer";
  flyer.setAttribute("aria-hidden", "true");
  const img = document.createElement("img");
  img.src = photoUrl;
  img.alt = "";
  flyer.append(img);
  document.body.append(flyer);
  return flyer;
}

function resolveTo(to: MotionBox | (() => MotionBox)): MotionBox {
  return snapBox(typeof to === "function" ? to() : to);
}

export async function playPhotoLift(opts: {
  photoUrl: string;
  from: MotionBox;
  to: MotionBox | (() => MotionBox);
  page: HTMLElement;
  hide?: HTMLElement | null;
  duration: number;
  pageFade?: "in" | "out" | "none";
  cancelled: () => boolean;
}) {
  const { photoUrl, from, to, page, hide, duration, pageFade = "none", cancelled } = opts;
  if (prefersReducedMotion()) {
    page.style.opacity = "1";
    if (hide) hide.style.visibility = "";
    return;
  }
  if (hide) hide.style.visibility = "hidden";
  const flyer = makeFlyer(photoUrl);
  const start = snapBox(from);
  applyBox(flyer, start);
  await tween(
    duration,
    (t) => {
      applyBox(flyer, mix(start, resolveTo(to), easeOutCubic(t)));
    },
    cancelled,
  );
  if (cancelled()) {
    flyer.remove();
    return;
  }
  applyBox(flyer, resolveTo(to));
  if (hide) hide.style.visibility = "";
  await nextPaint();
  flyer.remove();
  if (pageFade === "out") page.style.opacity = "0";
}

export function waitImage(el: HTMLImageElement) {
  if (el.complete && el.naturalWidth) return Promise.resolve();
  return new Promise<void>((resolve) => {
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => resolve(), { once: true });
  });
}

/** 观察页 contain 真正画出的那块，不是灰底外框。 */
export function containedImageBox(el: HTMLImageElement): MotionBox {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const bl = parseFloat(cs.borderLeftWidth) || 0;
  const br = parseFloat(cs.borderRightWidth) || 0;
  const bt = parseFloat(cs.borderTopWidth) || 0;
  const bb = parseFloat(cs.borderBottomWidth) || 0;
  const left = r.left + bl;
  const top = r.top + bt;
  const contentW = Math.max(0, r.width - bl - br);
  const contentH = Math.max(0, r.height - bt - bb);
  const nw = el.naturalWidth;
  const nh = el.naturalHeight;
  if (!nw || !nh || contentW <= 0 || contentH <= 0) {
    return snapBox({ left, top, width: contentW, height: contentH });
  }
  const scale = Math.min(contentW / nw, contentH / nh);
  const width = nw * scale;
  const height = nh * scale;
  return snapBox({
    left: left + (contentW - width) / 2,
    top: top + (contentH - height) / 2,
    width,
    height,
  });
}
