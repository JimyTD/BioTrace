/**
 * 壳资源包：/shell/<themeId>/
 * 衬纸可选；不用贴图的皮肤把 `--page-texture` / `--nav-texture` 留成 none。
 * 页面禁止写死 /shell/daylight/。
 */
import { getActiveTheme, themeAssetBase, themeAssetUrl, type ThemeId } from "./core";

export function themeShellBase(theme: ThemeId = getActiveTheme()): string {
  return themeAssetBase("shell", theme);
}

export function themeShellAsset(file: string, theme: ThemeId = getActiveTheme()): string {
  return themeAssetUrl("shell", file, theme);
}

/** 顶栏/底栏纸纹（可选；接入时把皮肤 `--nav-texture` 设为 url(...)） */
export function shellNavTextureUrl(theme?: ThemeId): string {
  return themeShellAsset("page-texture.jpg", theme ?? getActiveTheme());
}
