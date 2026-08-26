import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { t, type MessageKey } from "@biotrace/messages";
import type { Rarity } from "../api";
import { volumeCeremonyBgUrl, volumeSealCompleteUrl } from "../themes";
import { themeSlot, type SettleStagePhase } from "../themes/slots";

/** 中性样张，跟着皮肤走；勿写死某一皮肤目录。 */
const SAMPLE_PHOTO = "/trips/_sample-photo.jpg";
const RARITIES: Rarity[] = ["N", "R", "SR", "SSR", "UR", "LR", "XR"];

const PHASES: SettleStagePhase[] = ["sealed", "revealing", "open"];

export default function SettleArtPreviewPage() {
  // ?phase= / ?rarity= 让走查能直接落在某一阶段，不必点按钮
  const [params] = useSearchParams();
  const [phase, setPhase] = useState<SettleStagePhase>(() => {
    const want = params.get("phase") as SettleStagePhase | null;
    return want && PHASES.includes(want) ? want : "sealed";
  });
  const [rarity, setRarity] = useState<Rarity>(() => {
    const want = params.get("rarity") as Rarity | null;
    return want && RARITIES.includes(want) ? want : "SR";
  });
  // ?photo=/... 换样张。默认那张是棕褐铜版画，判断不了「颜色显出来」这类效果，
  // 走查要看真实照片时传一张进来（只收同源路径）
  const photoUrl = (() => {
    const want = params.get("photo");
    return want?.startsWith("/") ? want : SAMPLE_PHOTO;
  })();
  const SettleStage = themeSlot("settleStage");
  // ?hold=1 让阶段停在原地不自己往下走。揭示只有几百毫秒，不冻住就截不到中间态
  const hold = params.get("hold") === "1";
  const onRevealed = useCallback(() => {
    if (!hold) setPhase("open");
  }, [hold]);

  return (
    <div className="stack settle-page settle-art-preview">
      <header className="page-head">
        <h1 className="page-title">{t("settle.preview.title")}</h1>
        <p className="lede">{t("settle.preview.lede")}</p>
      </header>

      <div className="settle-preview-phases" role="tablist" aria-label={t("settle.preview.phases")}>
        {(
          [
            ["sealed", "settle.preview.phaseSealed"],
            ["revealing", "settle.preview.phaseReveal"],
            ["open", "settle.preview.phaseOpen"],
          ] as const
        ).map(([id, key]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`btn secondary${phase === id ? " is-active" : ""}`}
            aria-selected={phase === id}
            onClick={() => setPhase(id)}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <div className="settle-card">
        <div className="settle-card-inner">
          <SettleStage
            phase={phase}
            photoUrl={photoUrl}
            photoAlt={t("settle.preview.sampleName")}
            rarity={rarity}
            mark={{ when: params.get("when"), where: params.get("where") }}
            onRevealed={onRevealed}
          />
          {phase === "sealed" ? (
            <div className="settle-actions">
              <button className="btn" type="button" onClick={() => setPhase("revealing")}>
                {t("settle.open")}
              </button>
            </div>
          ) : null}
          {phase === "revealing" ? <p className="muted">{t("settle.opening")}</p> : null}
          {phase === "open" ? (
            <div className="settle-reveal stack">
              <strong className="settle-name">{t("settle.preview.sampleName")}</strong>
              <span className="muted">{t(`rarity.${rarity}` as MessageKey)}</span>
              <button className="btn" type="button" disabled>
                {t("settle.claim")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="stack">
        <p className="muted section-kicker">{t("settle.rarity")}</p>
        <div className="settle-preview-phases">
          {RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              className={`btn secondary${rarity === r ? " is-active" : ""}`}
              onClick={() => {
                setRarity(r);
                setPhase("open");
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="stack">
        <p className="muted section-kicker">{t("settle.volumeCeremonyCompleteTitle")}</p>
        <div className="modal-panel volume-ceremony is-complete settle-preview-ceremony">
          <img
            className="ceremony-bg"
            src={volumeCeremonyBgUrl("complete")}
            alt=""
            aria-hidden
          />
          <img className="ceremony-seal" src={volumeSealCompleteUrl()} alt="" aria-hidden />
          <div className="ceremony-body stack">
            <p className="muted section-kicker">{t("settle.volumeCeremonyCompleteTitle")}</p>
            <p className="volume-ceremony-line">{t("settle.preview.ceremonySample")}</p>
          </div>
        </div>
      </div>

      <Link className="btn secondary" to="/">
        {t("detail.back")}
      </Link>
    </div>
  );
}
