import type { Rarity } from "../api";
import {
  settlePackBgUrl,
  settlePackSealedUrl,
  settlePhotoFrameUrl,
} from "../themes";
import { SettleRaritySeal } from "./SettleRaritySeal";

export type SettleStagePhase = "sealed" | "revealing" | "open";

type Props = {
  phase: SettleStagePhase;
  photoUrl: string;
  photoAlt?: string;
  rarity?: Rarity | null;
};

/** 单开包视觉舞台：封缄壳 / 启封 / 展出（稀有度引子叠字） */
export function SettlePackStage({ phase, photoUrl, photoAlt = "", rarity = null }: Props) {
  const revealing = phase === "revealing";
  // 揭示中仍占封缄窗位；勿挂 is-open，否则会与展出 inset 抢样式
  const stageMode = phase === "open" ? "is-open" : "is-sealed";

  return (
    <div className={`settle-stage ${stageMode}${revealing ? " is-revealing" : ""}`}>
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

      {rarity ? <SettleRaritySeal rarity={rarity} /> : null}
    </div>
  );
}
