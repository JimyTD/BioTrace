import {
  easeOutCubic,
  lerp,
  measureBox,
  prefersReducedMotion,
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

export async function playPhotoLift(opts: {
  photoUrl: string;
  from: MotionBox;
  to: MotionBox;
  page: HTMLElement;
  hide?: HTMLElement | null;
  duration: number;
  pageFade: "in" | "out" | "none";
  cancelled: () => boolean;
}) {
  const { photoUrl, from, to, page, hide, duration, pageFade, cancelled } = opts;
  if (prefersReducedMotion()) {
    page.style.opacity = "1";
    if (hide) hide.style.visibility = "";
    return;
  }
  if (pageFade === "in") page.style.opacity = "0";
  if (hide) hide.style.visibility = "hidden";
  const flyer = makeFlyer(photoUrl);
  applyBox(flyer, from);
  await tween(
    duration,
    (t) => {
      const e = easeOutCubic(t);
      applyBox(flyer, mix(from, to, e));
      if (pageFade === "in") page.style.opacity = String(e);
      if (pageFade === "out") page.style.opacity = String(1 - e);
    },
    cancelled,
  );
  flyer.remove();
  if (cancelled()) return;
  page.style.opacity = pageFade === "out" ? "0" : "1";
  if (hide && pageFade !== "out") hide.style.visibility = "";
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
  const box = measureBox(el);
  const nw = el.naturalWidth;
  const nh = el.naturalHeight;
  if (!nw || !nh) return box;
  const scale = Math.min(box.width / nw, box.height / nh);
  const width = nw * scale;
  const height = nh * scale;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
}
