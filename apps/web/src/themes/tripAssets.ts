/**
 * 旅途主题资源包：/trips/<themeId>/
 * 相框须几何 SVG：边垫可见、仅中心挖空。页面禁止写死路径。
 */
import { getActiveTheme, themeAssetBase, themeAssetUrl, type ThemeId } from "./core";

export function themeTripBase(theme: ThemeId = getActiveTheme()): string {
  return themeAssetBase("trips", theme);
}

export function themeTripAsset(file: string, theme: ThemeId = getActiveTheme()): string {
  return themeAssetUrl("trips", file, theme);
}

/** 列表封面几何外框（中心透明，边垫不透明） */
export function tripCoverFrameUrl(theme?: ThemeId): string {
  return themeTripAsset("cover-frame.svg", theme ?? getActiveTheme());
}

/** 相册胶片/邮票几何框（内窗 8% inset） */
export function tripFilmFrameUrl(theme?: ThemeId): string {
  return themeTripAsset("film-frame.svg", theme ?? getActiveTheme());
}

/** 空态卷首图：中心留空椭圆，空态文案落在椭圆里 */
export function tripFrontispieceUrl(theme?: ThemeId): string {
  return themeTripAsset("frontispiece.jpg", theme ?? getActiveTheme());
}
