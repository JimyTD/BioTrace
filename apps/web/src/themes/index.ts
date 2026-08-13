/**
 * 皮肤主题入口（与 packages/messages 同思路：表现层集中，业务页不写死品牌色/资源路径）。
 *
 * - 配色 token：themes/*.css → [data-theme]
 * - 套册资源包：public/volumes/<themeId>/，经 volumeAssets helper 引用
 * - 旅途资源包：public/trips/<themeId>/，经 tripAssets helper 引用
 * - 壳资源包：public/shell/<themeId>/，经 shellAssets helper 引用（纸纹可空）
 * - 结构 class：styles.css 只用 var(--*)
 */
export {
  applyTheme,
  DEFAULT_THEME,
  getActiveTheme,
  initTheme,
  isThemeId,
  THEME_IDS,
  type ThemeId,
} from "./core";

export {
  themeVolumeAsset,
  themeVolumeBase,
  volumeCeremonyBgUrl,
  volumeCoverUrl,
  volumeSealCompleteUrl,
  volumeStampFrameUrl,
} from "./volumeAssets";

export {
  settlePackBgUrl,
  settlePackSealedUrl,
  settlePhotoFrameUrl,
  settleRaritySealUrl,
  themeSettleAsset,
  themeSettleBase,
} from "./settleAssets";

export {
  themeTripAsset,
  themeTripBase,
  tripCoverFrameUrl,
  tripFilmFrameUrl,
} from "./tripAssets";

export {
  shellNavTextureUrl,
  themeShellAsset,
  themeShellBase,
} from "./shellAssets";