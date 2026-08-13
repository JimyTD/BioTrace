/**
 * 壳资源包：/shell/<themeId>/
 * 顶栏/底栏纸纹可空；没有文件时 CSS `--nav-texture: none`，纯 token 底。
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
  return themeShellAsset("nav-texture.png", theme ?? getActiveTheme());
}
