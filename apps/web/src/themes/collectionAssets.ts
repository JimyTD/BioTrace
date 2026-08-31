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
  return themeAssetUrl("collection", "tree-door.png", theme);
}

/** 这一层几个孩子对应哪张仰视。1–4 各一张分叉，再多走进树冠。 */
export function collectionTreeSceneUrl(
  childCount: number,
  theme: ThemeId = getActiveTheme(),
): string | null {
  if (!ownsCollection(theme) || childCount < 1) return null;
  if (childCount >= 5) return themeAssetUrl("collection", "tree-crown.png", theme);
  return themeAssetUrl("collection", `tree-n${childCount}.png`, theme);
}
