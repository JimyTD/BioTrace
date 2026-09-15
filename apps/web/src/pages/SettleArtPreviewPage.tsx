import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { t, type MessageKey } from "@biotrace/messages";
import type { Rarity } from "../api";
import { volumeCeremonyBgUrl, volumeSealCompleteUrl } from "../themes";
import { themeSlot, type SettleStagePhase } from "../themes/slots";

/**
 * 美术走查页（路由 /dev/settle-art），用户走不到。
 * 这一页自己的说明文字**直接写明文**，不落 packages/messages ——
 * 那是用户可见文案的术语表，走查页的文案进去会被计入改造工作量、也可能被皮肤 voice 覆盖。
 * 见 docs/features/文案工程规范.md §一（例外）。
 */

/** 中性样张，跟着皮肤走；勿写死某一皮肤目录。 */
const SAMPLE_PHOTO = "/trips/_sample-photo.jpg";
const RARITIES: Rarity[] = ["N", "R", "SR", "SSR", "UR", "LR", "XR"];

const PHASES: SettleStagePhase[] = ["sealed", "revealing", "open"];

const PHASE_LABEL: Record<SettleStagePhase, string> = {
  sealed: "封缄",
  revealing: "揭示中",
  open: "展出",
};

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
        <h1 className="page-title">开包美术预览</h1>
        <p className="lede">只看叠层效果，不走识别接口。点阶段切换封缄 / 揭示 / 展出。</p>
      </header>

      <div className="settle-preview-phases">
        {PHASES.map((id) => (
          <button
            key={id}
            type="button"
            className={`btn secondary${phase === id ? " is-active" : ""}`}
            onClick={() => setPhase(id)}
          >
            {PHASE_LABEL[id]}
          </button>
        ))}
      </div>

      <div className="settle-card">
        <div className="settle-card-inner">
          <SettleStage
            phase={phase}
            photoUrl={photoUrl}
            photoAlt="示例标本"
            rarity={rarity}
            mark={{ when: params.get("when"), where: params.get("where") }}
            onRevealed={onRevealed}
          />
          {phase === "sealed" ? (
            <div className="settle-actions">
              <button className="btn" type="button" onClick={() => setPhase("revealing")}>
                请过目
              </button>
            </div>
          ) : null}
          {phase === "revealing" ? <p className="muted">请稍候…</p> : null}
          {phase === "open" ? (
            <div className="settle-reveal stack">
              <strong className="settle-name">示例标本</strong>
              <span className="muted">{t(`rarity.${rarity}` as MessageKey)}</span>
              <button className="btn" type="button" disabled>
                收下
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="stack">
        <p className="muted section-kicker">稀有度</p>
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
        <p className="muted section-kicker">整册点亮</p>
        <div className="modal-panel volume-ceremony is-complete settle-preview-ceremony">
          <img
            className="ceremony-bg"
            src={volumeCeremonyBgUrl("complete")}
            alt=""
          />
          <img className="ceremony-seal" src={volumeSealCompleteUrl()} alt="" />
          <div className="ceremony-body stack">
            <p className="muted section-kicker">整册点亮</p>
            <p className="volume-ceremony-line">「潮间带」整册点亮（预览）</p>
          </div>
        </div>
      </div>

      <Link className="btn secondary" to="/">
        {t("common.back")}
      </Link>
    </div>
  );
}
