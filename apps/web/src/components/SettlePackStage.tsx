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
  const sealed = phase === "sealed";
  const revealing = phase === "revealing";
  const showingPack = sealed || revealing;
  const showFrame = !sealed;
  const showSeal = phase === "open" && rarity;
  // 揭示中仍占封缄窗位；勿挂 is-open，否则会与展出 inset 抢样式
  const stageMode = phase === "open" ? "is-open" : "is-sealed";

  return (
    <div
      className={`settle-stage ${stageMode}${revealing ? " is-revealing" : ""}`}
    >
      <img className="settle-pack-bg" src={settlePackBgUrl()} alt="" aria-hidden />

      <div className="settle-photo-mat">
        <div className="settle-photo-window">
          <img
            src={photoUrl}
            alt={photoAlt}
            className={sealed || phase === "revealing" ? "settle-blur" : "settle-hero"}
          />
        </div>
        {showFrame ? (
          <img className="settle-photo-frame" src={settlePhotoFrameUrl()} alt="" aria-hidden />
        ) : null}
      </div>

      {showingPack ? (
        <img className="settle-pack-shell" src={settlePackSealedUrl()} alt="" aria-hidden />
      ) : null}

      {showSeal ? <SettleRaritySeal rarity={rarity} /> : null}
    </div>
  );
}
