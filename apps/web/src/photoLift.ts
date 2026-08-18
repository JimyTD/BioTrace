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

/** source 的长宽比居中放进 dest（contain），克隆件才不会被拉变形。 */
export function containBoxIn(source: MotionBox, dest: MotionBox): MotionBox {
  if (source.width <= 0 || source.height <= 0) return snapBox(dest);
  const scale = Math.min(dest.width / source.width, dest.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return snapBox({
    left: dest.left + (dest.width - width) / 2,
    top: dest.top + (dest.height - height) / 2,
    width,
    height,
  });
}

/**
 * 待开包进场：飞的是相册里那只封缄格本身（模糊照片 + 腰封），落到信封上再化掉。
 * 不造裸照片飞片——清晰的一帧会提前泄底，也不该穿进封着的信封。
 */
export async function playSealLift(opts: {
  node: HTMLElement;
  from: MotionBox;
  to: MotionBox | (() => MotionBox);
  duration: number;
  fadeMs?: number;
  cancelled: () => boolean;
}) {
  const { node, from, to, duration, fadeMs = 160, cancelled } = opts;
  if (prefersReducedMotion()) return;
  const flyer = document.createElement("div");
  flyer.className = "photo-lift-flyer is-seal";
  flyer.setAttribute("aria-hidden", "true");
  const clone = node.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  flyer.append(clone);
  document.body.append(flyer);

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
  await tween(
    fadeMs,
    (t) => {
      flyer.style.opacity = String(1 - t);
    },
    cancelled,
  );
  flyer.remove();
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
  /** 落地后、收走飞片前。用来先揭开格子里的图，避免中间空一帧。 */
  onLanded?: () => void;
}) {
  const { photoUrl, from, to, page, hide, duration, pageFade = "none", cancelled, onLanded } =
    opts;
  if (prefersReducedMotion()) {
    page.style.opacity = "1";
    if (hide) hide.style.visibility = "";
    onLanded?.();
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
  onLanded?.();
  if (hide) hide.style.visibility = "visible";
  await nextPaint();
  if (cancelled()) {
    flyer.remove();
    return;
  }
  flyer.remove();
  if (hide) hide.style.visibility = "";
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
