import { useEffect, type CSSProperties } from "react";

import { themeSlot, type SettleStageProps } from "../themes/slots";

/**
 * 灯亮起来要多久。比默认皮肤的 700ms 长一点：
 * 撕开一层壳是「一下」，灯管点亮是「一段」。
 */
const REVEAL_MS = 900;

/**
 * 灯箱皮肤的开包舞台：片子已经在灯台上，只是灯还没开。
 *
 * 这里没有可撕的壳——默认皮肤那套是「拆封」，这套是「点亮」，
 * 同一个状态机（sealed / revealing / open）演的是两件事：
 * 灯灭时片子暗、灰、看不清；推上灯箱，灯亮，颜色自己浮出来。
 *
 * 阶段分工照 docs/features/皮肤主题.md §2.4：页面把 sealed 推到 revealing，
 * 演完由这儿喊 onRevealed()。节奏归皮肤，所以这儿的 900ms 不必和默认的 700ms 一样。
 */
export function LightboxLampStage({
  phase,
  photoUrl,
  photoAlt = "",
  rarity = null,
  mark,
  onRevealed,
}: SettleStageProps) {
  const revealing = phase === "revealing";
  const RankTag = themeSlot("raritySeal");
  const when = mark?.when?.trim();
  const where = mark?.where?.trim();

  useEffect(() => {
    if (!revealing) return;
    const timer = window.setTimeout(onRevealed, REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealing, onRevealed]);

  return (
    <div
      className={`lamp-stage is-${phase}`}
      style={{ "--lamp-ms": `${REVEAL_MS}ms` } as CSSProperties}
    >
      {/* 灯管透出来的那团光，在片子背后 */}
      <span className="lamp-glow" aria-hidden />

      <div className="lamp-slide">
        <span className="lamp-window">
          <img className="lamp-photo" src={photoUrl} alt={photoAlt} />
        </span>
        {/* 卡纸下沿的字。和相册格上那行是同一种东西：写在实物上，不是界面文字。
            灯没开时看不清，跟着灯一起浮出来 */}
        {when || where ? (
          <span className="lamp-mark" aria-hidden>
            <span>{when}</span>
            <span className="lamp-mark-where">{where}</span>
          </span>
        ) : null}
      </div>

      {rarity ? <RankTag rarity={rarity} /> : null}
    </div>
  );
}
