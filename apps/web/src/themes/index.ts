/**
 * 皮肤主题入口（与 packages/messages 同思路：表现层集中，业务页不写死品牌色）。
 *
 * - 页面/组件只使用 styles.css 里的语义 class 与 var(--*)。
 * - 具体配色、字体、圆角、氛围底写在 themes/*.css，挂在 [data-theme="…"] 上。
 * - 以后潜水皮肤：新增 themes/tide.css + 在此登记 id，不必改流程页逻辑。
 */

export type ThemeId = "daylight";

/** 已实现的皮肤；tide 等后续加入后再扩类型与 CSS。 */
export const THEME_IDS = ["daylight"] as const satisfies readonly ThemeId[];

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
