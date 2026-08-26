/**
 * 皮肤 id、登记表与切换（配色 CSS 在 *.css；资源包在 /<域>/<id>/）。
 */
import { setMessageVoice, type VoiceId } from "@biotrace/messages";

export type ThemeId = "daylight" | "clear";

/** 已实现的皮肤。走同一套页面，只换 token、资源槽与包装用词。 */
export const THEME_IDS = ["daylight", "clear"] as const satisfies readonly ThemeId[];

export const DEFAULT_THEME: ThemeId = "daylight";

/**
 * 退役 id → 现 id。改名后本地存的旧偏好不认识就会静默掉回默认皮肤，
 * 用户得重新去「外观」点一次；这张表免掉那一下。
 */
const LEGACY_THEME_IDS: Record<string, ThemeId> = {
  lightbox: "clear",
};

/** 主题化的静态资源域，对应 public/<域>/<themeId>/。 */
export type AssetDomain = "volumes" | "trips" | "settle" | "shell";

export const ASSET_DOMAINS = ["volumes", "trips", "settle", "shell"] as const satisfies readonly AssetDomain[];

/** 界面明暗。结构层据此调少量与底色方向绑定的效果（照片垫、反白描边等）。 */
export type ColorScheme = "light" | "dark";

export type ThemeMeta = {
  scheme: ColorScheme;
  /**
   * 该皮肤自备资源的域。未列出的域回退到 DEFAULT_THEME，
   * 所以新皮肤可以先只出一部分图，不会满屏破图。
   */
  assets: readonly AssetDomain[];
  /** 包装用词。default 用 packages/messages 基础文案。 */
  voice: VoiceId;
};

export const THEME_META: Record<ThemeId, ThemeMeta> = {
  daylight: { scheme: "light", assets: ASSET_DOMAINS, voice: "default" },
  /* 清透不铺壳纸纹（--page-texture: none），开包舞台与稀有度也整块换成了自己的组件，
     那两个域一张图都读不到，所以只声明 volumes / trips */
  clear: { scheme: "light", assets: ["volumes", "trips"], voice: "default" },
};

const STORAGE_KEY = "bt_theme";

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

export function themeMeta(id: ThemeId = getActiveTheme()): ThemeMeta {
  return THEME_META[id] ?? THEME_META[DEFAULT_THEME];
}

/** 资源目录前缀。该皮肤没有这个域的资源包时回退默认皮肤。 */
export function themeAssetBase(domain: AssetDomain, id: ThemeId = getActiveTheme()): string {
  const owner = themeMeta(id).assets.includes(domain) ? id : DEFAULT_THEME;
  return `/${domain}/${owner}`;
}

export function themeAssetUrl(
  domain: AssetDomain,
  file: string,
  id: ThemeId = getActiveTheme(),
): string {
  return `${themeAssetBase(domain, id)}/${file.replace(/^\/+/, "")}`;
}

export function applyTheme(id: ThemeId = DEFAULT_THEME): void {
  const meta = themeMeta(id);
  document.documentElement.dataset.theme = id;
  document.documentElement.dataset.scheme = meta.scheme;
  document.documentElement.style.colorScheme = meta.scheme;
  setMessageVoice(meta.voice);
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
    else if (saved && LEGACY_THEME_IDS[saved]) id = LEGACY_THEME_IDS[saved];
  } catch {
    /* ignore */
  }
  applyTheme(id);
  return id;
}
