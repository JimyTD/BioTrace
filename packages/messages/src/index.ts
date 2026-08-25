import { zh, type MessageKey } from "./zh.js";

const catalogs = {
  zh,
} as const;

export type Locale = keyof typeof catalogs;
export type { MessageKey };

export const defaultLocale: Locale = "zh";

/**
 * 包装用词（voice）：同一功能的不同叙事说法，由 Web 皮肤选定。
 * 覆盖表只写与基础文案不同的 key；当前仅 zh，加语言时按语言分表。
 * 服务端不调 setMessageVoice，恒为 default。
 */
export type VoiceId = "default";

const voices: Record<VoiceId, Partial<Record<MessageKey, string>>> = {
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
  const spoken = locale === "zh" ? voices[activeVoice][key] : undefined;
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

export const locales = Object.keys(catalogs) as Locale[];
