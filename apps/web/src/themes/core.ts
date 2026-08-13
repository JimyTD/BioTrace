/**
 * 皮肤 id 与切换（配色 CSS 在 *.css；套册位图在 /volumes/<id>/）。
 */
export type ThemeId = "daylight" | "tide";

/** 已实现的皮肤。默认仍是 daylight；tide 走同一套页面，只换 token 与资源槽。 */
export const THEME_IDS = ["daylight", "tide"] as const satisfies readonly ThemeId[];

export const DEFAULT_THEME: ThemeId = "daylight";

const STORAGE_KEY = "bt_theme";

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

export function applyTheme(id: ThemeId = DEFAULT_THEME): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode / blocked storage */
  }
}

/** 当前生效皮肤（读 DOM，缺省则默认）。 */
export function getActiveTheme(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const fromDom = document.documentElement.dataset.theme;
  if (isThemeId(fromDom)) return fromDom;
  return DEFAULT_THEME;
}

/** 启动时调用：读本地偏好，否则用默认旅游皮肤。 */
export function initTheme(): ThemeId {
  let id = DEFAULT_THEME;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isThemeId(saved)) id = saved;
  } catch {
    /* ignore */
  }
  applyTheme(id);
  return id;
}
