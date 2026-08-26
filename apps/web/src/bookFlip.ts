import { applyBox, easeInOut, easeOutCubic, lerp, tween } from "./motion";
import type { AlbumBeat, AlbumPlayer } from "./themes/slots";

/**
 * 默认皮肤进出旅途相册的走法：把列表里那本册子拿起来、摊到中间、翻开封面。
 *
 * 这是 `album` 槽位的缺省实现。骨架（components/TripBookLayer.tsx）负责图层：
 * 钉位、相位机、交接、退场路由、以及封面克隆体不存在时的退化路径；
 * 这儿只管这几个零件在这段时间里怎么动。分工见 docs/features/皮肤主题.md §2.4。
 *
 * 身后那页旅途列表（beat.shelf）也归这儿：翻开时把它糊掉并推远，
 * 合上时还原。换一套走法的皮肤可以完全不碰它。
 */

/** 封面以左边为轴转开。-95° 是转过头一点，看着像纸有厚度 */
function hinge(el: HTMLElement, opened: number) {
  el.style.transform = `rotateY(${lerp(0, -95, opened)}deg)`;
}

/** 半像素以下的模糊不值当开一层滤镜，直接 none */
function setBlur(el: HTMLElement, px: number) {
  const value = px <= 0.5 ? "none" : `blur(${px}px)`;
  el.style.filter = value;
  el.style.webkitFilter = value;
}

async function flipOpen({ cover, pages, scrim, shelf, from, held, cancelled }: AlbumBeat) {
  scrim.style.opacity = "0";
  pages.style.opacity = "0";
  setBlur(pages, 36);
  applyBox(cover, from);
  hinge(cover, 0);
  cover.style.opacity = "1";
  cover.style.visibility = "visible";
  if (shelf) {
    setBlur(shelf, 0);
    shelf.style.transform = "scale(1)";
  }

  // 1. 垫纸铺开，身后那页同时糊掉推远
  await tween(
    280,
    (t) => {
      const e = easeOutCubic(t);
      scrim.style.opacity = String(e);
      if (shelf) {
        setBlur(shelf, e * 44);
        shelf.style.transform = `scale(${lerp(1, 1.14, e)})`;
      }
    },
    cancelled,
  );
  if (cancelled()) return;

  // 2. 先把册子拿起来一点，再挪到中间——少了这一下就像在桌面上拖
  const lifted = { ...from, top: from.top - 14 };
  await tween(
    160,
    (t) => {
      const e = easeOutCubic(t);
      applyBox(cover, { ...from, top: lerp(from.top, lifted.top, e) });
    },
    cancelled,
  );
  if (cancelled()) return;

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
    cancelled,
  );
  if (cancelled()) return;
  applyBox(cover, held);

  // 3. 翻开：封面转走的同时内页从糊到清
  await tween(
    520,
    (t) => {
      const e = easeInOut(t);
      hinge(cover, e);
      pages.style.opacity = String(e);
      setBlur(pages, (1 - e) * 36);
    },
    cancelled,
  );
  if (cancelled()) return;
  hinge(cover, 1);
  cover.style.visibility = "hidden";
  pages.style.opacity = "1";
  setBlur(pages, 0);
  scrim.style.opacity = "1";
}

async function flipClose({ cover, pages, scrim, shelf, from, held, cancelled }: AlbumBeat) {
  pages.style.opacity = "1";
  scrim.style.opacity = "1";
  applyBox(cover, held);
  cover.style.visibility = "visible";
  hinge(cover, 1);

  await tween(
    380,
    (t) => {
      const e = easeInOut(t);
      hinge(cover, 1 - e);
      pages.style.opacity = String(1 - e);
      setBlur(pages, e * 36);
    },
    cancelled,
  );
  if (cancelled()) return;
  hinge(cover, 0);
  pages.style.opacity = "0";

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
      scrim.style.opacity = String(1 - e);
      if (shelf) {
        setBlur(shelf, (1 - e) * 44);
        shelf.style.transform = `scale(${lerp(1.14, 1, e)})`;
      }
    },
    cancelled,
  );
}

export const flipBook: AlbumPlayer = async (beat) => {
  if (beat.dir === "open") await flipOpen(beat);
  else await flipClose(beat);
};
