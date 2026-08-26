/**
 * 皮肤槽位：整块换实现的那一层。
 *
 * token 换颜色，卡纸栅格换摆位，两样都换不了「这一下怎么动」和「稀有度用什么表现」。
 * 这类东西交给皮肤直接给实现，登记在下面 THEME_SLOTS 里。
 *
 * 回退写法照抄 `THEME_META.assets`：皮肤没登记的槽位落回 DEFAULT_SLOTS，
 * 所以新皮肤可以一个槽位都不写，不会开天窗。DEFAULT_SLOTS 类型是全量的，
 * 少写一个编译就不过——回退这条路永远是全的。
 *
 * 边界没变：槽位决定「怎么演、长什么样」，**阶段何时推进、数据从哪来仍归骨架**。
 * 槽位清单与接口见 docs/features/皮肤主题.md §2.4。
 *
 * ⚠ 这个文件**不要**从 themes/index.ts 再导出。它 import 了组件，
 * 而组件 import 那个桶文件；一转出去就成环。用的人直接 `from "../themes/slots"`。
 */
import type { ComponentType } from "react";

import type { Rarity } from "../api";
import type { MotionBox } from "../motion";
import { SettlePackStage } from "../components/SettlePackStage";
import { SettleRaritySeal } from "../components/SettleRaritySeal";
import { flipBook } from "../bookFlip";
import { flyEaseOut } from "../photoLift";
import { slideUpFromPocket } from "../photoSlot";
import { DEFAULT_THEME, getActiveTheme, type ThemeId } from "./core";

// ── 动作槽位的入参 ─────────────────────────────────────────────
// 一个槽位一种形状，不强行并成一个万能类型：这三下的演员数量本来就不一样。
// 类型先定在这儿当契约，实现分批接（见文件末尾的待接清单）。

/**
 * 搬一张照片：格子 → 大图，或者反过来。
 * 骨架已经建好飞行体、按 from 摆好位、藏好源格子、处理完减动偏好与取消；
 * 皮肤只管它从 from 挪到 to 这段时间里怎么走。
 */
export type LiftBeat = {
  /** 飞行体，已在 body 里 */
  actor: HTMLElement;
  from: MotionBox;
  /** 终点每帧现取：落地页可能还在排版 */
  to: () => MotionBox;
  /** 落地页整页，配合 pageFade 用；没有就是 null */
  page: HTMLElement | null;
  pageFade: "in" | "out" | "none";
  /** 骨架给的建议时长（ms）。这一下在流程里有多重是骨架知道的，皮肤可以不听 */
  duration: number;
  cancelled: () => boolean;
};

/**
 * 进出旅途相册。演员比搬照片多：飞起来的封面、内页、垫纸，
 * 还有身后那页旅途列表——现在的翻书会把它糊开并放大，换动作时这只手也归皮肤。
 */
export type AlbumBeat = {
  /** 列表封面的克隆体 */
  cover: HTMLElement;
  /** 相册内页 */
  pages: HTMLElement;
  /** 垫纸（盖住身后一切的那层底） */
  scrim: HTMLElement;
  /** 身后的旅途列表，可能不在 */
  shelf: HTMLElement | null;
  /** 列表里那只封面的位置 */
  from: MotionBox;
  /** 摊开时封面停在哪 */
  held: MotionBox;
  dir: "open" | "close";
  cancelled: () => boolean;
};

/**
 * 收下之后照片落进相册格子。一次可能收下好几张，所以是一批一起动。
 * 骨架已经等过排版、解过图、处理完减动偏好与收尾，皮肤只管这批照片怎么进场。
 */
export type SlotBeat = {
  photos: HTMLElement[];
  duration: number;
  cancelled: () => boolean;
};

export type LiftPlayer = (beat: LiftBeat) => Promise<void>;
export type AlbumPlayer = (beat: AlbumBeat) => Promise<void>;
export type SlotPlayer = (beat: SlotBeat) => Promise<void>;

// ── 组件槽位的 props ───────────────────────────────────────────

/** 稀有度用什么表现。默认是封蜡章，皮肤可以换成深度标尺、色标、别的什么 */
export type RaritySealProps = { rarity: Rarity };

export type SettleStagePhase = "sealed" | "revealing" | "open";

/**
 * 开包舞台。
 * `sealed → revealing` 由页面上的按钮推（用户动作，归骨架）；
 * `revealing → open` 由舞台自己演完喊 `onRevealed()`（节奏归皮肤）。
 */
export type SettleStageProps = {
  phase: SettleStagePhase;
  photoUrl: string;
  photoAlt?: string;
  rarity: Rarity | null;
  onRevealed: () => void;
};

// ── 登记表 ─────────────────────────────────────────────────────

/**
 * 已经接上的槽位。**只列真接了的**——声明了却没人调用，跟声明不存在的资源域一样是空头支票。
 * 加新槽位：在这儿加一行、在 DEFAULT_SLOTS 里补上缺省实现、更新 §2.4 那张清单表。
 *
 */
export type ThemeSlots = {
  raritySeal: ComponentType<RaritySealProps>;
  settleStage: ComponentType<SettleStageProps>;
  lift: LiftPlayer;
  slot: SlotPlayer;
  album: AlbumPlayer;
};

export type SlotName = keyof ThemeSlots;

/**
 * 登记表存的是**取实现的函数**，不是实现本身。
 *
 * 因为默认实现之间会互相引用（开包舞台里要取稀有度槽位），
 * 于是 slots → 组件 → slots 成环。写成惰性的，引用推迟到渲染时才发生，
 * 模块谁先谁后加载都不会踩空。加新槽位时照抄这个写法。
 */
type SlotTable = { [K in SlotName]?: () => ThemeSlots[K] };

/** 缺省实现＝默认皮肤的实现。必须全，别的皮肤都靠它兜底。 */
const DEFAULT_SLOTS: Required<SlotTable> = {
  raritySeal: () => SettleRaritySeal,
  settleStage: () => SettlePackStage,
  lift: () => flyEaseOut,
  slot: () => slideUpFromPocket,
  album: () => flipBook,
};

/** 各皮肤自己的实现。没列的槽位自动落回 DEFAULT_SLOTS。 */
const THEME_SLOTS: Partial<Record<ThemeId, SlotTable>> = {
  // daylight 就是缺省实现，不必登记
  // lightbox: { settleStage: () => LightboxLampStage },
};

/**
 * 取当前皮肤的槽位实现，没登记就回退默认皮肤。
 *
 * 和资源 helper 一样在渲染时现取，所以切皮肤后要整棵树重渲才会变——
 * 现在切皮肤走的是「我的 → 外观」再返回，天然会重渲。
 */
export function themeSlot<K extends SlotName>(
  name: K,
  id: ThemeId = getActiveTheme(),
): ThemeSlots[K] {
  const pick = THEME_SLOTS[id]?.[name] ?? THEME_SLOTS[DEFAULT_THEME]?.[name] ?? DEFAULT_SLOTS[name];
  return pick();
}

/** 这个皮肤自己实现了哪些槽位。写文档、排查「为什么这皮肤跟默认一样」时用得上。 */
export function themeOwnSlots(id: ThemeId = getActiveTheme()): SlotName[] {
  return Object.keys(THEME_SLOTS[id] ?? {}) as SlotName[];
}
