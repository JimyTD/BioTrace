import { easeOutCubic, nextPaint, prefersReducedMotion, tween } from "./motion";
import { themeSlot, type SlotPlayer } from "./themes/slots";

/** 骨架给的建议时长。皮肤换了走法可以不听 */
const SLOT_MS = 640;

/** 刚收下、正在落进格子的那些照片 */
const SLOTTING = ".film-tile.is-slotting .film-tile-photo";

/**
 * 默认皮肤的入槽走法：从格子下沿推上来。
 *
 * 这是 `slot` 槽位的缺省实现。皮肤要换成别的进场（淡入、翻转、从水里浮上来），
 * 在 themes/slots.ts 里登记自己的 SlotPlayer。分工见 docs/features/皮肤主题.md §2.4。
 */
export const slideUpFromPocket: SlotPlayer = async ({ photos, duration, cancelled }) => {
  await tween(
    duration,
    (t) => {
      const y = (1 - easeOutCubic(t)) * 108;
      for (const photo of photos) photo.style.transform = `translateY(${y}%)`;
    },
    cancelled,
  );
};

/**
 * 照片入槽的骨架。杂务全在这儿，且**不归皮肤管**：
 * 等排版落定、等图解码完（不然会先闪一帧空白）、减动偏好下直接就位、取消检查、收尾归零。
 * 中间「怎么进场」那一段交给 `slot` 槽位。
 *
 * @param onSettled 动作走完时调，用来清掉页面上的「正在入槽」状态
 */
export async function playPhotoSlot(opts: {
  cancelled: () => boolean;
  onSettled: () => void;
}): Promise<void> {
  const { cancelled, onSettled } = opts;
  const reduce = prefersReducedMotion();

  await nextPaint();
  if (cancelled()) return;
  const photos = [...document.querySelectorAll<HTMLElement>(SLOTTING)];
  if (photos.length === 0) return;
  await Promise.all(
    photos.map((img) =>
      img instanceof HTMLImageElement && img.decode
        ? img.decode().catch(() => undefined)
        : Promise.resolve(),
    ),
  );
  await nextPaint();
  if (cancelled()) return;

  const settle = () => {
    for (const photo of photos) photo.style.transform = "translateY(0)";
    onSettled();
  };

  if (reduce) {
    settle();
    return;
  }
  await themeSlot("slot")({ photos, duration: SLOT_MS, cancelled });
  if (cancelled()) return;
  settle();
}
