import {
  applyBox,
  easeOutCubic,
  mixBox,
  nextPaint,
  prefersReducedMotion,
  snapBox,
  tween,
  type MotionBox,
} from "./motion";
import { themeSlot, type LiftPlayer } from "./themes/slots";

/**
 * 默认皮肤搬照片的走法：一段 easeOutCubic，落地页同时淡入或淡出。
 *
 * 这是 `lift` 槽位的缺省实现。皮肤要换成别的走法（弧线、多段、带别的东西一起动），
 * 在 themes/slots.ts 里登记自己的 LiftPlayer 即可；杂务由下面的 playPhotoLift 包办，
 * 换皮肤的人只需要管从起点到终点这段时间里怎么走。分工见 docs/features/皮肤主题.md §2.4。
 */
export const flyEaseOut: LiftPlayer = async ({
  actor,
  from,
  to,
  page,
  pageFade,
  duration,
  cancelled,
}) => {
  await tween(
    duration,
    (t) => {
      const e = easeOutCubic(t);
      applyBox(actor, mixBox(from, to(), e));
      if (page && pageFade === "in") page.style.opacity = String(e);
      if (page && pageFade === "out") page.style.opacity = String(1 - e);
    },
    cancelled,
  );
};

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

/**
 * 搬一张照片的骨架。杂务全在这儿，且**不归皮肤管**：
 * 建飞行体、藏源格子、减动偏好下直接落地、取消检查、收尾清理。
 * 中间「怎么走」那一段交给 `lift` 槽位。
 */
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
  // 这几步必须同步发生在 layout 里、第一帧绘制前：覆盖层纸底是不透明的，
  // 若先等大图再开演，中间会闪出整页二级页。
  if (pageFade === "in") page.style.opacity = "0";
  if (hide) hide.style.visibility = "hidden";
  const flyer = makeFlyer(photoUrl);
  const start = snapBox(from);
  applyBox(flyer, start);
  if (pageFade === "in" && hide instanceof HTMLImageElement) await waitImage(hide);
  if (pageFade === "in") await nextPaint();
  if (cancelled()) {
    flyer.remove();
    return;
  }
  await themeSlot("lift")({
    actor: flyer,
    from: start,
    // 终点每帧现取：落地页可能还在排版
    to: () => resolveTo(to),
    page,
    pageFade,
    duration,
    cancelled,
  });
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
  else if (pageFade === "in") page.style.opacity = "1";
}

export function waitImage(el: HTMLImageElement) {
  if (el.complete && el.naturalWidth) return Promise.resolve();
  return new Promise<void>((resolve) => {
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => resolve(), { once: true });
  });
}

/** 后台拉原图并 decode。比例和当前图差太多则返回 null（不换，避免落地后拧一下）。 */
export async function decodeIfSimilarAspect(
  url: string,
  current: { width: number; height: number } | null,
): Promise<string | null> {
  const img = new Image();
  img.src = url;
  await waitImage(img);
  if (!img.naturalWidth || !img.naturalHeight) return null;
  if (current?.width && current.height) {
    const a = current.width / current.height;
    const b = img.naturalWidth / img.naturalHeight;
    if (Math.abs(a - b) / a > 0.08) return null;
  }
  try {
    await img.decode();
  } catch {
    /* 部分 WebView 无 decode；load 过即可换 */
  }
  return url;
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
