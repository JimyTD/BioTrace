/**
 * 套册主题资源包路径（换皮肤 = 换 /volumes/<theme>/ 目录）。
 * 页面只调 helper，禁止写死 /volumes/daylight/...。
 * 分层约定见 docs/features/套册美术分层.md。
 */
import { DEFAULT_THEME, getActiveTheme, type ThemeId } from "./core";

export function themeVolumeBase(theme: ThemeId = getActiveTheme()): string {
  return `/volumes/${theme}`;
}

export function themeVolumeAsset(file: string, theme: ThemeId = getActiveTheme()): string {
  const name = file.replace(/^\/+/, "");
  return `${themeVolumeBase(theme)}/${name}`;
}

/** 册皮：cover-<volumeId>.png（与配置 id 对齐，如 intertidal） */
export function volumeCoverUrl(volumeId: string, theme?: ThemeId): string {
  return themeVolumeAsset(`cover-${volumeId}.png`, theme ?? getActiveTheme());
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
  const file = kind === "complete" ? "ceremony-complete.png" : "ceremony-slot.png";
  return themeVolumeAsset(file, theme ?? getActiveTheme());
}

export function defaultThemeVolumeBase(): string {
  return themeVolumeBase(DEFAULT_THEME);
}
