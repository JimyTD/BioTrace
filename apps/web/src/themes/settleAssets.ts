/**
 * 单开包主题资源包：/settle/<themeId>/
 * 叠层元件须透明底（SVG 引子，或绿幕 HSV 色键 PNG）；氛围底可为不透明整幅。
 */
import { getActiveTheme, themeAssetBase, themeAssetUrl, type ThemeId } from "./core";

export function themeSettleBase(theme: ThemeId = getActiveTheme()): string {
  return themeAssetBase("settle", theme);
}

export function themeSettleAsset(file: string, theme: ThemeId = getActiveTheme()): string {
  return themeAssetUrl("settle", file, theme);
}

/** 未揭示时盖住照片的壳：日光是封缄牛皮纸，暗房是未显影的相纸。 */
export function settlePackSealedUrl(theme?: ThemeId): string {
  return themeSettleAsset("pack-sealed.png", theme ?? getActiveTheme());
}

export function settlePackBgUrl(theme?: ThemeId): string {
  return themeSettleAsset("pack-bg.png", theme ?? getActiveTheme());
}

export function settlePhotoFrameUrl(theme?: ThemeId): string {
  return themeSettleAsset("photo-frame.svg", theme ?? getActiveTheme());
}

/**
 * 稀有度章 SVG 路径（备用）。UI 已改内联 path 填色，勿再拿去 CSS mask。
 * XR 用异形六角章。
 */
export function settleRaritySealUrl(theme?: ThemeId, rarity?: string | null): string {
  const id = theme ?? getActiveTheme();
  if (rarity === "XR") return themeSettleAsset("rarity-seal-xr.svg", id);
  return themeSettleAsset("rarity-seal.svg", id);
}
