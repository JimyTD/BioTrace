/**
 * 用户账号上的皮肤 id。与 apps/web/src/themes/core.ts 的 ThemeId 对齐；
 * 加皮肤时两边一起改，API 不 import web。
 */
export const USER_THEME_IDS = ["clear", "daylight"] as const;
export type UserThemeId = (typeof USER_THEME_IDS)[number];

const LEGACY_THEME_IDS: Record<string, UserThemeId> = {
  lightbox: "clear",
};

export function canonicalizeUserTheme(value: string | null | undefined): UserThemeId | null {
  if (!value) return null;
  if ((USER_THEME_IDS as readonly string[]).includes(value)) return value as UserThemeId;
  return LEGACY_THEME_IDS[value] ?? null;
}
