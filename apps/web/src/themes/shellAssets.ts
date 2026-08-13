/**
 * 壳资源包：/shell/<themeId>/
 * 衬纸可选；没有文件时皮肤 token `--page-texture` / `--nav-texture` 为 none。
 * 页面禁止写死 /shell/daylight/。
 */
import { getActiveTheme, type ThemeId } from "./core";

export function themeShellBase(theme: ThemeId = getActiveTheme()): string {
  return `/shell/${theme}`;
}

export function themeShellAsset(file: string, theme: ThemeId = getActiveTheme()): string {
  return `${themeShellBase(theme)}/${file.replace(/^\/+/, "")}`;
}

/** 顶栏/底栏纸纹（可选；接入时把皮肤 `--nav-texture` 设为 url(...)） */
export function shellNavTextureUrl(theme?: ThemeId): string {
  return themeShellAsset("page-texture.jpg", theme ?? getActiveTheme());
}
