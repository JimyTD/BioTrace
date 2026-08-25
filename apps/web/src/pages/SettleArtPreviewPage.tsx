import { useState } from "react";
import { Link } from "react-router-dom";
import { t, type MessageKey } from "@biotrace/messages";
import type { Rarity } from "../api";
import { SettlePackStage, type SettleStagePhase } from "../components/SettlePackStage";
import { volumeCeremonyBgUrl, volumeSealCompleteUrl } from "../themes";

/** 中性样张，跟着皮肤走；勿写死某一皮肤目录。 */
const SAMPLE_PHOTO = "/trips/_sample-photo.jpg";
const RARITIES: Rarity[] = ["N", "R", "SR", "SSR", "UR", "LR", "XR"];

export default function SettleArtPreviewPage() {
  const [phase, setPhase] = useState<SettleStagePhase>("sealed");
  const [rarity, setRarity] = useState<Rarity>("SR");

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
          <SettlePackStage
            phase={phase}
            photoUrl={SAMPLE_PHOTO}
            photoAlt={t("settle.preview.sampleName")}
            rarity={rarity}
          />
          {phase === "sealed" ? (
            <div className="settle-actions">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setPhase("revealing");
                  window.setTimeout(() => setPhase("open"), 700);
                }}
              >
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
