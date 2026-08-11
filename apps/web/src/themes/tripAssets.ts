/**
 * 旅途主题资源包：/trips/<themeId>/
 * 氛围底可为不透明整幅；相框须几何透明 SVG。
 * 页面只调 helper，禁止写死 /trips/daylight/...。
 */
import { getActiveTheme, type ThemeId } from "./core";

export function themeTripBase(theme: ThemeId = getActiveTheme()): string {
  return `/trips/${theme}`;
}

export function themeTripAsset(file: string, theme: ThemeId = getActiveTheme()): string {
  return `${themeTripBase(theme)}/${file.replace(/^\/+/, "")}`;
}

/** 列表零旅途空态氛围 */
export function tripListEmptyUrl(theme?: ThemeId): string {
  return themeTripAsset("list-empty.jpg", theme ?? getActiveTheme());
}

/** 无封面旅途扉页垫底（中心宜空，留给虚线窗） */
export function tripCoverEmptyUrl(theme?: ThemeId): string {
  return themeTripAsset("cover-empty.jpg", theme ?? getActiveTheme());
}

/** 相册零观察空态氛围 */
export function tripAlbumEmptyUrl(theme?: ThemeId): string {
  return themeTripAsset("album-empty.jpg", theme ?? getActiveTheme());
}

/** 列表封面几何外框 */
export function tripCoverFrameUrl(theme?: ThemeId): string {
  return themeTripAsset("cover-frame.svg", theme ?? getActiveTheme());
}

/** 相册胶片/邮票几何框 */
export function tripFilmFrameUrl(theme?: ThemeId): string {
  return themeTripAsset("film-frame.svg", theme ?? getActiveTheme());
}
