import { useEffect, type CSSProperties } from "react";

import { themeSlot, type SettleStageProps } from "../themes/slots";

/**
 * 由糊到清要多久。比默认皮肤撕壳的 700ms 略长一点：
 * 撕开一层壳是「一下」，一张照片显清楚是「一段」。
 */
const REVEAL_MS = 780;

/**
 * 清透皮肤的开包舞台：照片带着暖白边，从一小叠里浮上来、由糊到清。
 *
 * 这里没有可撕的壳，也没有要点亮的灯——前身「灯箱」那套叙事连同它的文案已经退役。
 * 这套皮肤不讲故事，只有观感，所以同一个状态机（sealed / revealing / open）
 * 演的是最朴素的一件事：一张照片显出来。
 *
 * 阶段分工照 docs/features/皮肤主题.md §2.4：页面把 sealed 推到 revealing，
 * 演完由这儿喊 onRevealed()。节奏归皮肤，所以这儿的 780ms 不必和默认的 700ms 一样。
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

  useEffect(() => {
    if (!revealing) return;
    const timer = window.setTimeout(onRevealed, REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealing, onRevealed]);

  return (
    <div
      className={`reveal-stage is-${phase}`}
      style={{ "--reveal-ms": `${REVEAL_MS}ms` } as CSSProperties}
    >
      {/* 压在底下的两张。是道具不是数据——空卡纸，不放照片：
          给「这一张在最上面」一个交代，又不假造别人拍了什么。
          真要摆同旅途的兄弟照片得让结算页多取一次，那是数据不是皮肤 */}
      <span className="reveal-under reveal-under-l" aria-hidden />
      <span className="reveal-under reveal-under-r" aria-hidden />

      {/* 照片浮上来时边上漫开的一层柔光，散掉就没了 */}
      <span className="reveal-bloom" aria-hidden />

      <div className="reveal-card">
        <span className="reveal-window">
          <img className="reveal-photo" src={photoUrl} alt={photoAlt} />
        </span>
        {/* 卡纸下沿那行字。和相册格上那行是同一种东西：写在实物上，不是界面文字 */}
        {when || where ? (
          <span className="reveal-mark" aria-hidden>
            <span>{when}</span>
            <span className="reveal-mark-where">{where}</span>
          </span>
        ) : null}
      </div>

      {rarity ? <RankChip rarity={rarity} /> : null}
    </div>
  );
}
