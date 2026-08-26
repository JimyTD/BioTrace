import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { formatRank, hasMessage, t, type MessageKey } from "@biotrace/messages";
import { acceptedScientificIfDifferent, api, type Observation, type Rarity, type SettleVolumesResult } from "../api";
import { identifyByLine } from "../identifyLabel";
import { useBackClose } from "../androidBack";
import { ListTagRow } from "../components/ListTagRow";
import ReidentifyDialog from "../components/ReidentifyDialog";
import { themeSlot } from "../themes/slots";
import { peekObservation, rememberObservation } from "../pageCache";
import { peekLiftBackground } from "../photoLiftHandoff";
import { volumeCeremonyBgUrl, volumeSealCompleteUrl } from "../themes";

function rarityLabel(r: Rarity | null) {
  if (!r) return "—";
  return t(`rarity.${r}` as MessageKey);
}

function msgKey(key: string): string {
  return hasMessage(key) ? t(key) : key;
}

/** 打在片框上的日期。给卡纸型皮肤用，取月-日，和相册格上那行同一个形状。 */
function stampDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

export default function ObservationSettlePage({ userId }: { userId?: string }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const background = peekLiftBackground(location);
  const [obs, setObs] = useState<Observation | null>(() => {
    const cached = peekObservation(id);
    return cached?.status === "pending_settle" ? cached : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"sealed" | "revealing" | "open" | "claimed">("sealed");
  const [claiming, setClaiming] = useState(false);
  const [reidentifyOpen, setReidentifyOpen] = useState(false);
  const [reidentifying, setReidentifying] = useState(false);
  const [ceremony, setCeremony] = useState<{ kind: CeremonyKind; line: string } | null>(null);
  useBackClose(() => {
    if (obs) navigate(`/trips/${obs.tripId}`);
    else navigate("/");
  });

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
          setObs(observation);
          rememberObservation(observation);
          setPhase("sealed");
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
        rememberObservation(observation);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("settle.failed")));
  }, [id, navigate, background]);

  // 用户点了按钮才启封，这一步归页面；揭示演多久由舞台自己说了算（见槽位层 §2.4）
  function onOpen() {
    setPhase("revealing");
  }

  const onRevealed = useCallback(() => setPhase("open"), []);

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

  async function onReidentify(description: string) {
    if (!obs) return;
    setReidentifying(true);
    setError(null);
    try {
      const { observation } = await api.reidentifyObservation(obs.id, description);
      setReidentifyOpen(false);
      rememberObservation(observation);
      setObs(observation);
      setPhase("sealed");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("detail.reidentifyFailed"));
    } finally {
      setReidentifying(false);
    }
  }

  useEffect(() => {
    if (!obs || obs.status !== "analyzing") return;
    const timer = window.setInterval(() => {
      void api
        .getObservation(id, true)
        .then(({ observation }) => {
          if (observation.status === "failed" || observation.status === "settled") {
            navigate(`/observations/${id}`, {
              replace: true,
              state: background ? { background } : undefined,
            });
            return;
          }
          setObs(observation);
          rememberObservation(observation);
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [id, obs?.status, navigate, background]);

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
  const waitingIdentify = obs.status === "analyzing";
  const sealed = phase === "sealed";
  const stagePhase = phase === "claimed" ? "open" : phase;
  const SettleStage = themeSlot("settleStage");

  return (
    <div className="stack settle-page">
      <header className="page-head">
        <h1 className="page-title">{t("settle.title")}</h1>
        <p className="lede">{t("settle.lede")}</p>
      </header>

      <div className={`settle-card ${phase}`}>
        <div className="settle-card-inner">
          <SettleStage
            phase={stagePhase}
            photoUrl={obs.displayUrl}
            photoAlt={sealed ? "" : title}
            rarity={obs.rarity}
            mark={{ when: stampDate(obs.capturedAt), where: obs.locationLabel }}
            onRevealed={onRevealed}
          />

          {sealed ? (
            <div className="settle-actions">
              <button className="btn" type="button" disabled={waitingIdentify} onClick={onOpen}>
                {waitingIdentify ? t("detail.reidentifying") : t("settle.open")}
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
                  <ListTagRow tags={obs.tags} />
                  {(() => {
                    const by = identifyByLine(obs.identifyProvider, obs.identifyModel);
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
                  {obs.blurb ? <p className="blurb">{obs.blurb}</p> : null}

                  {phase !== "claimed" ? (
                    <>
                      <button className="btn" type="button" disabled={claiming || reidentifying} onClick={onClaim}>
                        {claiming ? t("settle.claiming") : t("settle.claim")}
                      </button>
                      {userId && obs.userId === userId ? (
                        <button
                          className="btn secondary"
                          type="button"
                          disabled={claiming || reidentifying}
                          onClick={() => setReidentifyOpen(true)}
                        >
                          {reidentifying ? t("detail.reidentifying") : t("detail.reidentify")}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <ReidentifyDialog
        open={reidentifyOpen}
        busy={reidentifying}
        initialDescription={obs.description}
        onCancel={() => {
          if (!reidentifying) setReidentifyOpen(false);
        }}
        onConfirm={onReidentify}
      />
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
