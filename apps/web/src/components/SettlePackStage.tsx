import { useEffect, type CSSProperties } from "react";

import {
  settlePackBgUrl,
  settlePackSealedUrl,
  settlePhotoFrameUrl,
} from "../themes";
import { themeSlot, type SettleStageProps } from "../themes/slots";

/** 揭示演多久。这个数归舞台，换皮肤就换节奏，页面不该知道 */
const REVEAL_MS = 700;

/**
 * 默认皮肤的开包舞台：封缄壳 / 启封 / 展出。
 *
 * 也是 `settleStage` 槽位的缺省实现，没登记自己舞台的皮肤都落回这里。
 * 阶段推进的分工见 docs/features/皮肤主题.md §2.4：
 * 页面把 sealed 推到 revealing（用户点了按钮），演完由这儿喊 onRevealed()。
 */
export function SettlePackStage({
  phase,
  photoUrl,
  photoAlt = "",
  rarity = null,
  onRevealed,
}: SettleStageProps) {
  const revealing = phase === "revealing";
  // 揭示中仍占封缄窗位；勿挂 is-open，否则会与展出 inset 抢样式
  const stageMode = phase === "open" ? "is-open" : "is-sealed";
  // 稀有度用什么表现由皮肤定，没登记就是默认皮肤那枚封蜡章
  const RaritySeal = themeSlot("raritySeal");

  useEffect(() => {
    if (!revealing) return;
    const timer = window.setTimeout(onRevealed, REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealing, onRevealed]);

  return (
    <div
      className={`settle-stage ${stageMode}${revealing ? " is-revealing" : ""}`}
      style={{ "--reveal-ms": `${REVEAL_MS}ms` } as CSSProperties}
    >
      {/* 零件一次渲全，哪一段亮、摆在哪都由 CSS 按阶段类名定。
          见 docs/features/皮肤主题.md §2.3 */}
      <img className="settle-pack-bg" src={settlePackBgUrl()} alt="" aria-hidden />

      <div className="settle-photo-mat">
        <div className="settle-photo-window">
          <img className="settle-photo-img" src={photoUrl} alt={photoAlt} />
        </div>
        <img className="settle-photo-frame" src={settlePhotoFrameUrl()} alt="" aria-hidden />
      </div>

      <img className="settle-pack-shell" src={settlePackSealedUrl()} alt="" aria-hidden />

      {rarity ? <RaritySeal rarity={rarity} /> : null}
    </div>
  );
}
