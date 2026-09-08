import { zh, zhFlavor, type MessageKey, type ThemedMessageKey } from "./zh.js";

const catalogs = {
  zh,
} as const;

export type Locale = keyof typeof catalogs;
export type { MessageKey, ThemedMessageKey };

export const defaultLocale: Locale = "zh";

/**
 * 包装用词（voice）：同一功能的不同叙事说法，由 Web 皮肤选定。
 * 覆盖表只写与基础文案不同的 key；当前仅 zh，加语言时按语言分表。
 * 服务端不调 setMessageVoice，恒为 default。
 *
 * 目前两套皮肤都用 default：清透换的是观感不是说法。机制留着，
 * 将来真有一套自带叙事的皮肤（比如深海）再加覆盖表。
 */
export type VoiceId = "default";

/** 固定区 key 全集：运行时守卫用。覆盖表漏进固定 key 时，t() 不认。 */
const themedKeys: ReadonlySet<ThemedMessageKey> = new Set<string>(Object.keys(zhFlavor)) as ReadonlySet<ThemedMessageKey>;

const voices: Record<VoiceId, Partial<Record<ThemedMessageKey, string>>> = {
  default: {},
};

export const VOICE_IDS = Object.keys(voices) as VoiceId[];

export const defaultVoice: VoiceId = "default";

let activeVoice: VoiceId = defaultVoice;

export function isVoiceId(value: string | null | undefined): value is VoiceId {
  return typeof value === "string" && value in voices;
}

export function setMessageVoice(id: VoiceId = defaultVoice): void {
  activeVoice = isVoiceId(id) ? id : defaultVoice;
}

export function getMessageVoice(): VoiceId {
  return activeVoice;
}

type Vars = Record<string, string | number>;

export function t(key: MessageKey, vars?: Vars, locale: Locale = defaultLocale): string {
  const table = catalogs[locale] ?? catalogs.zh;
  // 运行时闸：只有可文案区 key 才允许走 voice 覆盖，固定区一律走基础表。
  const spoken = locale === "zh" && themedKeys.has(key as ThemedMessageKey) ? voices[activeVoice][key as ThemedMessageKey] : undefined;
  let text: string = spoken ?? table[key] ?? catalogs.zh[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function hasMessage(key: string): key is MessageKey {
  return key in catalogs.zh;
}

/** 将 API 的 finest_reliable_rank（family/genus…）格式化为界面用语。 */
export function formatRank(rank: string | null | undefined, locale: Locale = defaultLocale): string {
  if (!rank || !rank.trim()) return t("common.unknown", undefined, locale);
  const raw = rank.trim();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");

  const aliases: Record<string, MessageKey> = {
    kingdom: "rank.kingdom",
    phylum: "rank.phylum",
    class: "rank.class",
    order: "rank.order",
    family: "rank.family",
    genus: "rank.genus",
    species: "rank.species",
    subspecies: "rank.subspecies",
    superfamily: "rank.superfamily",
    subfamily: "rank.subfamily",
    tribe: "rank.tribe",
    infraorder: "rank.infraorder",
    suborder: "rank.suborder",
    superclass: "rank.superclass",
    subclass: "rank.subclass",
    division: "rank.division",
    domain: "rank.domain",
    // 中文直出
    界: "rank.kingdom",
    门: "rank.phylum",
    纲: "rank.class",
    目: "rank.order",
    科: "rank.family",
    属: "rank.genus",
    种: "rank.species",
    亚种: "rank.subspecies",
    总科: "rank.superfamily",
    亚科: "rank.subfamily",
    族: "rank.tribe",
    下目: "rank.infraorder",
    亚目: "rank.suborder",
    总纲: "rank.superclass",
    亚纲: "rank.subclass",
    部: "rank.division",
    域: "rank.domain",
  };

  const msgKey = aliases[key] ?? aliases[raw];
  if (msgKey) return t(msgKey, undefined, locale);
  return raw;
}

/** 量表 12 题键 → 中文说明。未知键原样返回。 */
export function formatScaleItemKey(key: string, locale: Locale = defaultLocale): string {
  const msgKey = `admin.rarityCache.item.${key}`;
  return hasMessage(msgKey) ? t(msgKey, undefined, locale) : key;
}

/** 量表分批 id（gate/city/attitude）→ 中文。 */
export function formatScaleBatch(id: string, locale: Locale = defaultLocale): string {
  const msgKey = `admin.rarityCache.batch.${id}`;
  return hasMessage(msgKey) ? t(msgKey, undefined, locale) : id;
}

/** 名录档 `class_i` / `sanyou` / `extinct` → 固定区标签。 */
export function formatScaleListLevel(
  level: string | null | undefined,
  locale: Locale = defaultLocale,
): string {
  if (!level) return "";
  const msgKey = `listTag.${level}`;
  return hasMessage(msgKey) ? t(msgKey, undefined, locale) : level;
}

/**
 * 把缓存里的加减码译成中文说明，旧缓存 `domestic-1` 与特殊闸门都能读。
 * 例：`驯化家畜/宠物 −1`、`成体能到成年人量级 +0.5`。
 */
export function formatScaleAdjustment(raw: string, locale: Locale = defaultLocale): string {
  const s = raw.trim();
  if (!s) return s;

  const special: Record<string, MessageKey> = {
    "gate:extinct": "admin.rarityCache.adj.extinct",
    extinct: "admin.rarityCache.adj.extinct",
    chain_unavailable: "admin.rarityCache.adj.chain_unavailable",
    identify_mock: "admin.rarityCache.adj.identify_mock",
  };
  const specialKey = special[s];
  if (specialKey) return t(specialKey, undefined, locale);

  const m = s.match(/^([a-z_]+)([+-]\d+(?:\.\d+)?)$/i);
  if (!m) return s;
  const tag = m[1]!.toLowerCase();
  const delta = m[2]!;

  const tagToItem: Record<string, string> = {
    indoor: "indoor",
    near: "near_home",
    domestic: "domesticated",
    disliked: "disliked",
    dense: "habitat_common",
    swarm: "swarm",
    night: "nocturnal",
    window: "short_window",
    liked: "liked",
    large: "large",
    narrow: "narrow_range",
    absent: "often_absent",
  };
  const tagToList: Record<string, MessageKey> = {
    class_i: "listTag.class_i",
    class_ii: "listTag.class_ii",
    sanyou: "listTag.sanyou",
  };

  let label = tag;
  const itemKey = tagToItem[tag];
  if (itemKey) label = formatScaleItemKey(itemKey, locale);
  else if (tagToList[tag]) label = t(tagToList[tag]!, undefined, locale);
  else if (special[tag]) label = t(special[tag]!, undefined, locale);

  const pretty = delta.startsWith("-") ? `−${delta.slice(1)}` : delta;
  return `${label} ${pretty}`;
}

export const locales = Object.keys(catalogs) as Locale[];
