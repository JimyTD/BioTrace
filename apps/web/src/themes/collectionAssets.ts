/**
 * 图鉴主题资源（换皮肤 = 换 /collection/<theme>/）。
 * 页面只调 helper。皮肤未声明 collection 域时返回 null，不要去默认皮肤凑一张 404。
 */
import { getActiveTheme, themeAssetUrl, themeMeta, type ThemeId } from "./core";

function ownsCollection(theme: ThemeId): boolean {
  return themeMeta(theme).assets.includes("collection");
}

export function collectionTreeDoorUrl(theme: ThemeId = getActiveTheme()): string | null {
  if (!ownsCollection(theme)) return null;
  return themeAssetUrl("collection", "tree-door.webp", theme);
}
