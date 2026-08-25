/**
 * 套册主题资源包路径（换皮肤 = 换 /volumes/<theme>/ 目录）。
 * 页面只调 helper，禁止写死 /volumes/daylight/...。
 * 皮肤未自备 volumes 资源时由 themeAssetBase 回退默认皮肤。
 * 分层约定见 docs/features/套册美术分层.md。
 */
import { getActiveTheme, themeAssetBase, themeAssetUrl, type ThemeId } from "./core";

export function themeVolumeBase(theme: ThemeId = getActiveTheme()): string {
  return themeAssetBase("volumes", theme);
}

export function themeVolumeAsset(file: string, theme: ThemeId = getActiveTheme()): string {
  return themeAssetUrl("volumes", file, theme);
}

/**
 * 册皮：cover-<volumeId>.png（与配置 id 对齐，如 intertidal）
 * colored 取集齐后的手工上色版 cover-<volumeId>-colored.jpg——同一幅画上了色，
 * 沿用 19 世纪图版书「素版 / 彩版」的卖法，集齐的奖励是画面本身变了。
 */
export function volumeCoverUrl(
  volumeId: string,
  opts: { colored?: boolean; theme?: ThemeId } = {},
): string {
  const file = opts.colored ? `cover-${volumeId}-colored.jpg` : `cover-${volumeId}.png`;
  return themeVolumeAsset(file, opts.theme ?? getActiveTheme());
}

/**
 * 空槽的素版线刻：plate-<volumeId>-<slotId>.png
 * 集邮册的印刷底样——没集到的位置先印着图，集到了用自己的照片盖住。
 * 缺图时页面回退到斜线空槽，所以未备图版的套册不会 404 出错位。
 */
export function volumeSlotPlateUrl(
  volumeId: string,
  slotId: string,
  theme?: ThemeId,
): string {
  return themeVolumeAsset(`plate-${volumeId}-${slotId}.png`, theme ?? getActiveTheme());
}

export function volumeStampFrameUrl(theme?: ThemeId): string {
  return themeVolumeAsset("stamp-frame.svg", theme ?? getActiveTheme());
}

export function volumeSealCompleteUrl(theme?: ThemeId): string {
  return themeVolumeAsset("seal-complete.svg", theme ?? getActiveTheme());
}

export function volumeCeremonyBgUrl(
  kind: "slot" | "complete",
  theme?: ThemeId,
): string {
  const file = kind === "complete" ? "ceremony-complete.jpg" : "ceremony-slot.jpg";
  return themeVolumeAsset(file, theme ?? getActiveTheme());
}
