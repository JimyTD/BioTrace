import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { formatRank, hasMessage, t, type MessageKey } from "@biotrace/messages";
import { acceptedScientificIfDifferent, api, type Observation, type Rarity, type SettleVolumesResult } from "../api";
import { SettlePackStage } from "../components/SettlePackStage";
import { measureBox } from "../motion";
import { containBoxIn, playSealLift } from "../photoLift";
import { clearPhotoLiftHandoff, peekLiftBackground, peekPhotoLiftHandoff } from "../photoLiftHandoff";
import { volumeCeremonyBgUrl, volumeSealCompleteUrl } from "../themes";

function rarityLabel(r: Rarity | null) {
  if (!r) return "—";
  return t(`rarity.${r}` as MessageKey);
}

function identifyByLine(provider: string | null | undefined) {
  if (!provider) return null;
  const key = `identify.provider.${provider}` as MessageKey;
  const name = t(key);
  return t("identify.by", { name: name === key ? provider : name });
}

function msgKey(key: string): string {
  return hasMessage(key) ? t(key) : key;
}

type CeremonyKind = "complete" | "slot";

function buildCeremony(volumes: SettleVolumesResult): {
  kind: CeremonyKind;
  line: string;
} | null {
  const completed = volumes.newlyCompleted ?? [];
  if (completed.length > 0) {
    const volume = msgKey(completed[0]!.titleKey);
    const line =
      completed.length === 1
        ? t("settle.volumeCompleted", { volume })
        : t("settle.volumeCompletedMore", { volume, count: completed.length });
    return { kind: "complete", line };
  }

  const lit = volumes.newlyLit ?? [];
  if (lit.length === 0) return null;
  const first = lit[0]!;
  const volume = msgKey(first.volumeTitleKey);
  const slot = msgKey(first.slotTitleKey);
  const line =
    lit.length === 1
      ? t("settle.volumeSlotLit", { volume, slot })
      : t("settle.volumeSlotLitMore", {
          volume,
          slot,
          count: lit.length - 1,
        });
  return { kind: "slot", line };
}

export default function ObservationSettlePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const background = peekLiftBackground(location);
  const [obs, setObs] = useState<Observation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"sealed" | "revealing" | "open" | "claimed">("sealed");
  const [claiming, setClaiming] = useState(false);
  const [ceremony, setCeremony] = useState<{ kind: CeremonyKind; line: string } | null>(null);
  const [liftOpen] = useState(() => {
    const found = peekPhotoLiftHandoff();
    return found && found.dir === "open" && found.observationId === id ? found : null;
  });
  const pageRef = useRef<HTMLDivElement | null>(null);
  const liftPlayed = useRef(false);

  useEffect(() => {
    api
      .getObservation(id, true)
      .then(({ observation }) => {
        if (observation.status === "settled") {
          navigate(`/observations/${id}`, {
            replace: true,
            state: background ? { background } : undefined,
          });
          return;
        }
        if (observation.status === "analyzing") {
          navigate(`/trips/${observation.tripId}`, { replace: true });
          return;
        }
        if (observation.status === "failed") {
          navigate(`/observations/${id}`, {
            replace: true,
            state: background ? { background } : undefined,
          });
          return;
        }
        setObs(observation);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("settle.failed")));
  }, [id, navigate, background]);

  useLayoutEffect(() => {
    if (!liftOpen || !obs || liftPlayed.current) return;
    const stage = pageRef.current?.querySelector(".settle-stage");
    if (!(stage instanceof HTMLElement)) return;
    // 相册仍挂在下层，可以取到那只封缄格；深链或地图点进来没有它，就不演。
    const cell = document.querySelector<HTMLElement>(
      `.film-tile[data-obs-id="${liftOpen.observationId}"] .film-tile-media`,
    );
    liftPlayed.current = true;
    clearPhotoLiftHandoff();
    if (!cell) return;
    const from = measureBox(cell);
    let cancelled = false;
    void playSealLift({
      node: cell,
      from,
      to: () => containBoxIn(from, measureBox(stage)),
      duration: 420,
      cancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [liftOpen, obs]);

  function onOpen() {
    setPhase("revealing");
    window.setTimeout(() => setPhase("open"), 700);
  }

  async function onClaim() {
    if (!obs) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await api.settleObservation(obs.id);
      const volumes = res.volumes ?? {
        newlyLit: [],
        newlyCompletedVolumeIds: [],
        newlyCompleted: [],
      };
      const next = buildCeremony(volumes);
      if (!next) {
        navigate(`/trips/${obs.tripId}`, { replace: true });
        return;
      }
      setCeremony(next);
      setPhase("claimed");
      setClaiming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settle.failed"));
      setClaiming(false);
    }
  }

  if (error && !obs) {
    return (
      <div className="stack">
        <p className="error">{error}</p>
        <Link className="btn secondary" to="/">
          {t("detail.back")}
        </Link>
      </div>
    );
  }

  if (!obs) return <p className="muted">{t("app.loading")}</p>;

  const title = obs.commonName || obs.scientificName || t("detail.unnamed");
  const acceptedSci = acceptedScientificIfDifferent(obs);
  const sealed = phase === "sealed";
  const stagePhase = phase === "claimed" ? "open" : phase;

  return (
    <div className="stack settle-page" ref={pageRef}>
      <header className="page-head">
        <h1 className="page-title">{t("settle.title")}</h1>
        <p className="lede">{t("settle.lede")}</p>
      </header>

      <div className={`settle-card ${phase}`}>
        <div className="settle-card-inner">
          <SettlePackStage
            phase={stagePhase}
            photoUrl={obs.displayUrl}
            photoAlt={sealed ? "" : title}
            rarity={obs.rarity}
          />

          {sealed ? (
            <div className="settle-actions">
              <button className="btn" type="button" onClick={onOpen}>
                {t("settle.open")}
              </button>
            </div>
          ) : (
            <div className="settle-reveal stack">
              {phase === "revealing" ? (
                <p className="muted">{t("settle.opening")}</p>
              ) : (
                <>
                  {obs.rarity ? (
                    <span className="sr-only">{rarityLabel(obs.rarity)}</span>
                  ) : null}
                  <strong className="settle-name">{title}</strong>
                  {obs.scientificName ? <span className="muted">{obs.scientificName}</span> : null}
                  {acceptedSci ? (
                    <span className="muted">{t("detail.acceptedScientificName", { name: acceptedSci })}</span>
                  ) : null}
                  {(() => {
                    const by = identifyByLine(obs.identifyProvider);
                    return by ? <span className="muted identify-by">{by}</span> : null;
                  })()}
                  {obs.finestReliableRank ? (
                    <span className="muted">
                      {t("album.reliableTo", { rank: formatRank(obs.finestReliableRank) })}
                    </span>
                  ) : null}
                  {obs.settleTier === "weak" ? (
                    <p className="muted">{t("settle.tierWeak")}</p>
                  ) : null}
                  {!obs.locationPrecise ? (
                    <p className="muted">{t("settle.locationImprecise")}</p>
                  ) : null}
                  {obs.alertIntroduced ? (
                    <div className="alert-banner">
                      <strong>{t("settle.alertIntroduced")}</strong>
                      <p>{t("settle.alertHint")}</p>
                    </div>
                  ) : null}
                  {obs.blurb ? <p className="blurb">{obs.blurb}</p> : null}

                  {phase !== "claimed" ? (
                    <button className="btn" type="button" disabled={claiming} onClick={onClaim}>
                      {claiming ? t("settle.claiming") : t("settle.claim")}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {phase !== "claimed" ? (
        <Link className="btn secondary" to={`/trips/${obs.tripId}`}>
          {t("settle.backAlbum")}
        </Link>
      ) : null}

      {phase === "claimed" && ceremony ? (
        <div className="modal-backdrop volume-ceremony-backdrop" role="presentation">
          <div
            className={`modal-panel volume-ceremony${
              ceremony.kind === "complete" ? " is-complete" : ""
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="volume-ceremony-title"
          >
            <img
              className="ceremony-bg"
              src={volumeCeremonyBgUrl(ceremony.kind === "complete" ? "complete" : "slot")}
              alt=""
              aria-hidden
            />
            {ceremony.kind === "complete" ? (
              <img
                className="ceremony-seal"
                src={volumeSealCompleteUrl()}
                alt=""
                aria-hidden
              />
            ) : null}
            <div className="ceremony-body stack">
              <p className="muted section-kicker" id="volume-ceremony-title">
                {ceremony.kind === "complete"
                  ? t("settle.volumeCeremonyCompleteTitle")
                  : t("settle.volumeCeremonyTitle")}
              </p>
              <p className="volume-ceremony-line">{ceremony.line}</p>
              <Link className="btn" to="/collection" replace>
                {t("settle.volumeToCollection")}
              </Link>
              <Link className="btn secondary" to={`/trips/${obs.tripId}`} replace>
                {t("settle.volumeContinue")}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
