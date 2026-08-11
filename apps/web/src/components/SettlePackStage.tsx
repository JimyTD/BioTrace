import type { Rarity } from "../api";
import {
  settlePackBgUrl,
  settlePackSealedUrl,
  settlePhotoFrameUrl,
  settleRaritySealUrl,
} from "../themes";

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
  const showingPack = sealed || phase === "revealing";
  const showFrame = !sealed;
  const showSeal = phase === "open" && rarity;

  return (
    <div className={`settle-stage ${phase}`}>
      <img className="settle-pack-bg" src={settlePackBgUrl()} alt="" aria-hidden />

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

      {showingPack ? (
        <img className="settle-pack-shell" src={settlePackSealedUrl()} alt="" aria-hidden />
      ) : null}

      {showSeal ? (
        <div className={`settle-rarity-seal rarity-${rarity}`}>
          <div
            className="settle-rarity-seal-motif"
            style={{ ["--seal-mask" as string]: `url("${settleRaritySealUrl(undefined, rarity)}")` }}
            aria-hidden
          />
          <span className="settle-rarity-letter">{rarity}</span>
        </div>
      ) : null}
    </div>
  );
}
