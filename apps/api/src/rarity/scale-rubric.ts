/**
 * 稀有度量表：12 道原子题（是/否/跳过）+ 名录查表，本地线性加权切档。
 * 这是生产与标定的唯一真源——`scripts/rarity-calibrate.ts` 也从这里引，
 * 题面与权重只有一份，两边不可能漂移。
 *
 * 一级、二级、三有、灭绝只查表（见 cn-status.ts），不问模型。
 */

export const SCALE_ITEM_KEYS = [
  "indoor",
  "domesticated",
  "disliked",
  "nocturnal",
  "near_home",
  "short_window",
  "swarm",
  "large",
  "habitat_common",
  "narrow_range",
  "often_absent",
  "liked",
] as const;

export type ScaleItemKey = (typeof SCALE_ITEM_KEYS)[number];
/** true / false / null=不确定，跳过这条的加减和「非 X」条件。 */
export type ScaleTri = boolean | null;
export type ScaleItems = Record<ScaleItemKey, ScaleTri>;

/** 档位全序，越靠前越稀有。全仓库只认这一张表。 */
export const RARITY_TIERS = ["XR", "LR", "UR", "SSR", "SR", "R", "N"] as const;
export type RarityTier = (typeof RARITY_TIERS)[number];

/** 收集价值：越高越稀有。表外的档位记 0。 */
export function collectibleRankFromTier(tier: string): number {
  const idx = (RARITY_TIERS as readonly string[]).indexOf(tier);
  if (idx < 0) return 0;
  return RARITY_TIERS.length - 1 - idx;
}

/**
 * 标定用的 0 题。生产不问：12 题全答 null 时得分为 0、正好落 SR，
 * 与「不认识就占位 SR」同值，null 机制已经覆盖了这件事。
 */
export const KNOW_RUBRIC = `你在为旅行 App「BioTrace」做内部核对。先只回答：你是否清楚这种东西在该国实际是什么样的。

只输出 JSON，字段顺序必须如下（reason 在最前）：
{"reason":"一句话","knows":true}

knows 只能是 true 或 false。
- true：你清楚它在该国长什么样、通常住在哪、普通人会怎么碰上。
- false：只听说过名字、分不清近缘种、或不确定它在该国实际怎么生活。

不要为了显得博学而答 true。不要输出稀有度字母档。不要回答其它问题。`;

const BATCH_PREAMBLE = `你在为旅行 App「BioTrace」做内部核对。下面每题只问一件事。
按该国现在的实际情况答。不要根据「它稀不稀有」来填。
有倾向就 true 或 false。只有完全没概念才填 null。
false 只表示你清楚它不是，不是「不太确定」。
已灭绝、保护级不由你判断——只答当前这几句问的事。
禁止输出 N/R/SR/SSR/UR/LR/XR。禁止输出未列出的字段。`;

/** 每题的题面。分批只决定哪几题同批出现，不改题面本身。 */
export const SCALE_QUESTIONS: Record<ScaleItemKey, string> = {
  indoor:
    "它是不是主要跟着人的房屋、家具或仓储生活？床铺、衣柜、墙缝、厨房、粮仓这一类。不是偶尔飞进楼里，也不是园养。翻柜子找到也算——问的是它跟不跟人的住，不是好不好找。",
  domesticated: "这是驯化家畜或宠物种吗？猫狗猪牛羊鸡这一类。不是野外种拿到园里养。",
  habitat_common:
    "遇见它的时候，是不是经常一次就能看到很多，而不是东一只西一只？问的是多不多，不是好不好找。",
  large: "成体体重是不是能到一个成年人的量级——五十公斤以上？",
  narrow_range: "它的分布范围是不是很窄，只限于少数特定地区，而不是横跨大片地区、多个国家广布？",
  near_home: "它平常是不是就住在市区里——住宅区、街道、公园绿地这些人住的地方？港口、海岸不算。",
  swarm: "它是不是经常成群出现？",
  nocturnal: "它主要在夜里活动吗？",
  short_window: "一年里只有很短一段时间能看见吗？",
  disliked: "多数人看见会不会觉得它讨厌或脏？多数人无感就填 false；只有不认识这个物种才填 null。",
  liked:
    "普通人是不是喜欢这种东西，觉得亲近或高兴？不是问名气，不是问保护级。多数人无感就填 false；只有不认识这个物种才填 null。",
  often_absent: "就算到了它生活的那种地方，是不是也常常见不到，得靠运气？",
};

/** 单题或多题共用一套外壳，题面从 SCALE_QUESTIONS 取，保证两处一字不差。 */
export function batchRubric(keys: ScaleItemKey[]): string {
  const example = Object.fromEntries([["reason", "一句话"], ...keys.map((k) => [k, null])]);
  const lines = keys.map((k) => `- ${k}：${SCALE_QUESTIONS[k]}`).join("\n");
  return `${BATCH_PREAMBLE}

只输出 JSON，字段顺序必须如下（reason 在最前）：
${JSON.stringify(example)}

${lines}`;
}

const BATCH_KEYS: Array<{ id: string; keys: ScaleItemKey[] }> = [
  { id: "gate", keys: ["indoor", "domesticated", "habitat_common", "large", "narrow_range"] },
  { id: "city", keys: ["near_home", "swarm", "nocturnal", "short_window"] },
  { id: "attitude", keys: ["disliked", "liked", "often_absent"] },
];

/** 按宗分批，每批三到五题，题面互不可见。 */
export const SCALE_BATCHES: Array<{ id: string; keys: ScaleItemKey[]; rubric: string }> =
  BATCH_KEYS.map((b) => ({ ...b, rubric: batchRubric(b.keys) }));

export function parseBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number" && (raw === 0 || raw === 1)) return raw === 1;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (["true", "yes", "y", "1", "是", "对"].includes(s)) return true;
  if (["false", "no", "n", "0", "否", "不是"].includes(s)) return false;
  return null;
}

/** 三态：true / false / null（不确定、跳过）。 */
export function parseTri(raw: unknown): ScaleTri {
  if (raw == null) return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number" && (raw === 0 || raw === 1)) return raw === 1;
  const s = String(raw).trim().toLowerCase();
  if (
    s === "" ||
    ["null", "none", "uncertain", "unknown", "skip", "不确定", "不清楚", "拿不准"].includes(s)
  ) {
    return null;
  }
  if (["true", "yes", "y", "1", "是", "对"].includes(s)) return true;
  if (["false", "no", "n", "0", "否", "不是"].includes(s)) return false;
  return null;
}

export function parseKnows(parsed: Record<string, unknown>): boolean {
  const v = parseBool(parsed.knows);
  if (v == null) throw new Error(`bad knows: ${String(parsed.knows)}`);
  return v;
}

export function parseScaleItems(
  parsed: Record<string, unknown>,
  keys: ScaleItemKey[],
): Partial<ScaleItems> {
  const out: Partial<ScaleItems> = {};
  for (const key of keys) {
    if (!(key in parsed)) throw new Error(`missing ${key}`);
    out[key] = parseTri(parsed[key]);
  }
  return out;
}

export function majorityBool(values: boolean[]): boolean {
  const yes = values.filter(Boolean).length;
  return yes * 2 > values.length;
}

/** 只在已作答的里取多数；平票或全跳过 → null。 */
export function mergeTri(values: ScaleTri[]): ScaleTri {
  const known = values.filter((v): v is boolean => v !== null);
  if (known.length === 0) return null;
  const yes = known.filter(Boolean).length;
  const no = known.length - yes;
  if (yes === no) return null;
  return yes > no;
}

export function emptyItems(): ScaleItems {
  return Object.fromEntries(SCALE_ITEM_KEYS.map((k) => [k, null])) as ScaleItems;
}

/** 逐题取多数，合成一份答案。 */
export function mergeItems(draws: ScaleItems[]): ScaleItems {
  const merged = emptyItems();
  for (const key of SCALE_ITEM_KEYS) {
    merged[key] = mergeTri(draws.map((d) => d[key]));
  }
  return merged;
}

function yes(v: ScaleTri): boolean {
  return v === true;
}

/** 是才计入；否/跳过 = 0。改这里就能离线重放拟合。 */
export const SCALE_WEIGHTS = {
  indoor: -1.0,
  domesticated: -1.0,
  disliked: -0.8,
  near_home: -0.5,
  habitat_common: -0.5,
  swarm: -0.4,
  sanyou: 0.8,
  class_ii: 1.8,
  class_i: 2.5,
  // 「难拍到」象限的三题同权：任一题答错只损失 0.3，三题同时为真才累积成明显抬分。
  nocturnal: 0.3,
  short_window: 0.3,
  often_absent: 0.3,
  large: 0.5,
  narrow_range: 0.4,
  liked: 0.8,
} as const;

/**
 * S 切档：每档宽度 1，界值比整数尺上移 0.5。0 落在 SR 中间。
 * 界值一律取严格小于——正好落在界上算高一档（-1.5 是 R，2.5 是 LR）。
 */
export const SCALE_BANDS = {
  n: -1.5,
  r: -0.5,
  sr: 0.5,
  ssr: 1.5,
  ur: 2.5,
} as const;

/**
 * 到最近档位界的距离。生产用它判断这一分算不算「贴着界」，
 * 贴界就补采样，别让一道噪声题决定档位。XR（99）离任何界都远，天然不触发。
 */
export function distanceToBand(score: number): number {
  return Math.min(...Object.values(SCALE_BANDS).map((b) => Math.abs(score - b)));
}

function bump(s: number, w: number, tag: string, adjustments: string[]): number {
  adjustments.push(`${tag}${w >= 0 ? "+" : ""}${w}`);
  return s + w;
}

export function rarityFromScore(s: number): string {
  if (s < SCALE_BANDS.n) return "N";
  if (s < SCALE_BANDS.r) return "R";
  if (s < SCALE_BANDS.sr) return "SR";
  if (s < SCALE_BANDS.ssr) return "SSR";
  if (s < SCALE_BANDS.ur) return "UR";
  return "LR";
}

export function scoreFromScale(
  items: ScaleItems,
  lists?: { sanyou?: boolean; extinct?: boolean; class_i?: boolean; class_ii?: boolean },
): {
  score: number;
  rarity: string;
  adjustments: string[];
} {
  if (lists?.extinct) {
    return { score: 99, rarity: "XR", adjustments: ["gate:extinct"] };
  }

  const classI = Boolean(lists?.class_i);
  const classII = Boolean(lists?.class_ii) && !classI;
  const sanyou = Boolean(lists?.sanyou) && !classI && !classII;
  const w = SCALE_WEIGHTS;

  let s = 0;
  const adjustments: string[] = [];

  // 离人阶梯：室内 > 市区 > 港口农田郊野（第三级不扣）。同一件事只算最重的一级。
  if (yes(items.indoor)) s = bump(s, w.indoor, "indoor", adjustments);
  else if (yes(items.near_home)) s = bump(s, w.near_home, "near", adjustments);

  if (yes(items.domesticated)) s = bump(s, w.domesticated, "domestic", adjustments);
  if (yes(items.disliked)) s = bump(s, w.disliked, "disliked", adjustments);

  // 遍地折扣：有保护级或只在短窗口出现的，成群不代表好遇见，豁免。
  // 众多与成群是同一件事，只扣一次。
  const abundant =
    yes(items.habitat_common) && !classI && !classII && !sanyou && !yes(items.short_window);
  if (abundant) s = bump(s, w.habitat_common, "dense", adjustments);
  else if (yes(items.swarm)) s = bump(s, w.swarm, "swarm", adjustments);

  if (classI) s = bump(s, w.class_i, "class_i", adjustments);
  else if (classII) s = bump(s, w.class_ii, "class_ii", adjustments);
  else if (sanyou) s = bump(s, w.sanyou, "sanyou", adjustments);

  // 遍地折扣生效时，夜行与常空手不再抬分：到处都是的东西，夜里照样碰得到，也谈不上难找。
  if (yes(items.nocturnal) && !abundant) s = bump(s, w.nocturnal, "night", adjustments);
  if (yes(items.short_window)) s = bump(s, w.short_window, "window", adjustments);
  if (yes(items.liked)) s = bump(s, w.liked, "liked", adjustments);
  if (yes(items.large)) s = bump(s, w.large, "large", adjustments);
  if (yes(items.narrow_range)) s = bump(s, w.narrow_range, "narrow", adjustments);
  if (yes(items.often_absent) && !abundant) s = bump(s, w.often_absent, "absent", adjustments);

  return { score: s, rarity: rarityFromScore(s), adjustments };
}

/** 不清楚时不编后面的题，本地占位 SR。 */
export const UNKNOWN_PLACEHOLDER_TIER = "SR";
