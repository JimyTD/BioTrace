import { useEffect, useMemo, type CSSProperties } from "react";

import { themeSlot, type SettleStageProps } from "../themes/slots";

/**
 * 四拍节奏：拿起 → 显影 → 定色 → 落章。
 * 拿起、显影、落章三拍定长；定色拍按时长逐档拉长——戏码多的档位定色就久
 * （XR 1350ms，N 380ms）。这套四拍节奏 2026-09 逐档拍板后移植进产品，
 * 规格见 docs/features/皮肤主题.md 开包段落（视觉基准原型在 docs/wip/ 保留）。
 */
const LIFT_MS = 260;
const DEV_MS = 640;
const LAND_MS = 380;

/** 定色时长、戏码强度、光尘/星闪数量，逐档。N 是零戏：白卡就该安静。 */
const GRADES: Record<Grade, { tint: number; drama: number; dust: number; spark: number }> = {
  N: { tint: 380, drama: 0.12, dust: 0, spark: 0 },
  R: { tint: 520, drama: 0.35, dust: 0, spark: 0 },
  SR: { tint: 680, drama: 0.6, dust: 3, spark: 2 },
  SSR: { tint: 850, drama: 0.85, dust: 6, spark: 4 },
  UR: { tint: 1020, drama: 1.0, dust: 9, spark: 6 },
  LR: { tint: 1200, drama: 1.15, dust: 12, spark: 8 },
  XR: { tint: 1350, drama: 1.3, dust: 14, spark: 10 },
};

type Grade = "N" | "R" | "SR" | "SSR" | "UR" | "LR" | "XR";

/** 光尘/星闪的档色板。这些是舞台自己的材质色，为什么不进 token 见 CSS 抬头。 */
const MOTE_C: Record<Grade, string | string[]> = {
  N: "#aab4bc",
  R: "#7ab8ff",
  SR: "#c9a0ff",
  SSR: "#ffd675",
  UR: "#ff9a80",
  LR: ["#d8c0ff", "#ffe27a", "#ffb0d8", "#b5f0d0"],
  XR: ["#ffc9ef", "#bfe6ff", "#ffe0a8", "#ffb0d8"],
};

type Mote = {
  key: string;
  left: string;
  top: string;
  size: string;
  color: string;
  dx: string;
  dy: string;
  dur: string;
  delay: string;
};

function gradeOf(rarity: string | null): Grade {
  return rarity != null && rarity in GRADES ? (rarity as Grade) : "N";
}

function moteColor(grade: Grade, i: number): string {
  const c = MOTE_C[grade];
  return Array.isArray(c) ? c[i % c.length]! : c;
}

/** 光尘：定色窗口内从照片区上浮的小亮点。位置随机，档位越高越多。 */
function buildDust(grade: Grade): Mote[] {
  const conf = GRADES[grade];
  return Array.from({ length: conf.dust }, (_, i) => ({
    key: `d${i}`,
    left: `${(18 + Math.random() * 64).toFixed(1)}%`,
    top: `${(28 + Math.random() * 46).toFixed(1)}%`,
    size: `${(2.2 + Math.random() * 2.6).toFixed(1)}px`,
    color: moteColor(grade, i),
    dx: `${(Math.random() * 56 - 28).toFixed(0)}px`,
    dy: `${(-(38 + Math.random() * 62)).toFixed(0)}px`,
    dur: `${((0.45 + Math.random() * 0.3) * conf.tint).toFixed(0)}ms`,
    delay: `${(LIFT_MS + DEV_MS + (0.04 + Math.random() * 0.2) * conf.tint).toFixed(0)}ms`,
  }));
}

/** 星闪：定色窗口内在照片区绽开的四角星。和光尘同一批色板，走得是「绽开再隐去」。 */
function buildSparks(grade: Grade): Mote[] {
  const conf = GRADES[grade];
  return Array.from({ length: conf.spark }, (_, i) => ({
    key: `s${i}`,
    left: `${(20 + Math.random() * 60).toFixed(1)}%`,
    top: `${(22 + Math.random() * 46).toFixed(1)}%`,
    size: `${(7 + Math.random() * 9).toFixed(1)}px`,
    color: moteColor(grade, i),
    dx: "0px",
    dy: "0px",
    dur: `${((0.35 + Math.random() * 0.3) * conf.tint).toFixed(0)}ms`,
    delay: `${(LIFT_MS + DEV_MS + (0.06 + Math.random() * 0.25) * conf.tint).toFixed(0)}ms`,
  }));
}

function moteStyle(m: Mote): CSSProperties {
  return {
    left: m.left,
    top: m.top,
    width: m.size,
    height: m.size,
    "--dust-c": m.color,
    "--dx": m.dx,
    "--dy": m.dy,
    "--dur": m.dur,
    "--delay": m.delay,
  } as CSSProperties;
}

/**
 * 清透皮肤的开包舞台（v4：稀有度当主角）。
 *
 * 四拍：拿起（卡片上抬）→ 显影（由糊到清）→ 定色（档色成色 + 光柱从照片底边升起
 * + 白闪 + 心搏 + 光尘星闪 + 流光描边，LR/XR 再加虹彩流转）→ 落章（药丸砸下、卡片震颤）。
 * 戏码按档位分层：N 零戏，XR 全套——demo 里逐档拍板的数量制。
 *
 * 阶段分工照 docs/features/皮肤主题.md §2.4：页面把 sealed 推到 revealing，
 * 演完由这儿喊 onRevealed()。节奏归皮肤，总时长随档位走（N 1.66s，XR 2.63s）。
 */
export function ClearRevealStage({
  phase,
  photoUrl,
  photoAlt = "",
  rarity = null,
  mark,
  onRevealed,
}: SettleStageProps) {
  const revealing = phase === "revealing";
  const RankChip = themeSlot("raritySeal");
  const when = mark?.when?.trim();
  const where = mark?.where?.trim();

  // 稀有度是 string：不在七档里的（含 null）一律按 N 演——没定级的片子不配光效
  const grade = gradeOf(rarity);
  const conf = GRADES[grade];
  const totalMs = LIFT_MS + DEV_MS + conf.tint + LAND_MS;

  // 粒子位置按档位生成一次就够：重播不靠重挂，is-revealing 类切走再切回，
  // CSS 动画自然从头再来（走查页反复点也能重看）
  const dust = useMemo(() => buildDust(grade), [grade]);
  const sparks = useMemo(() => buildSparks(grade), [grade]);

  useEffect(() => {
    if (!revealing) return;
    const timer = window.setTimeout(onRevealed, totalMs);
    return () => window.clearTimeout(timer);
  }, [revealing, onRevealed, totalMs]);

  return (
    <div
      className={`reveal-stage g-${grade} is-${phase}`}
      style={
        {
          "--lift-ms": `${LIFT_MS}ms`,
          "--dev-ms": `${DEV_MS}ms`,
          "--tint-ms": `${conf.tint}ms`,
          "--land-ms": `${LAND_MS}ms`,
          "--drama": conf.drama,
        } as CSSProperties
      }
    >
      {/* 压在底下的两张。是道具不是数据——空卡纸，不放照片：
          给「这一张在最上面」一个交代，又不假造别人拍了什么。
          真要摆同旅途的兄弟照片得让结算页多取一次，那是数据不是皮肤 */}
      <span className="reveal-under reveal-under-l" aria-hidden />
      <span className="reveal-under reveal-under-r" aria-hidden />

      {/* 照片浮上来时边上漫开的一层柔光，散掉就没了 */}
      <span className="reveal-bloom" aria-hidden />

      {/* 包一层 wrap：拿起的抬升动画、落章后回落都落在它身上，
          卡片本体只留震颤，两层 transform 不打架 */}
      <div className="reveal-card-wrap">
        {/* 流光描边：贴卡纸外壁的一圈光，LR/XR 四色常驻流转 */}
        <span className="reveal-edge" aria-hidden />
        <div className="reveal-card">
          <span className="reveal-window">
            <img className="reveal-photo" src={photoUrl} alt={photoAlt} />
            {/* 光柱：窗口裁剪保证出发点就是照片底边、左右就是照片两边 */}
            <span className="reveal-beam" aria-hidden />
            {/* 档色成色：定色拍从中央漫开的一层档色 */}
            <span className={`reveal-tint tint-${grade}`} aria-hidden />
            {/* 心搏白光：定色中段照片透亮一拍 */}
            <span className="reveal-pulse" aria-hidden />
            {/* 白闪：定色开闸的一瞬 */}
            <span className="reveal-flash" aria-hidden />
            {/* 扫光：从左到右一道，UR/SSR 递弱 */}
            <span className="reveal-sheen" aria-hidden />
          </span>
          {/* 卡纸下沿那行字。和相册格上那行是同一种东西：写在实物上，不是界面文字 */}
          {when || where ? (
            <span className="reveal-mark" aria-hidden>
              <span>{when}</span>
              <span className="reveal-mark-where">{where}</span>
            </span>
          ) : null}
        </div>
        {/* 光尘与星闪：数量按档位，位置随机——演员是 JS 派的，戏码开关在 CSS */}
        {dust.map((m) => (
          <span key={m.key} className="dust" style={moteStyle(m)} aria-hidden />
        ))}
        {sparks.map((m) => (
          <span key={m.key} className="spark" style={moteStyle(m)} aria-hidden />
        ))}
      </div>

      {rarity ? <RankChip rarity={rarity} /> : null}
    </div>
  );
}
