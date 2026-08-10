import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatRank, t, type MessageKey } from "@biotrace/messages";
import { api, type Observation, type Rarity } from "../api";

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

export default function ObservationSettlePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [obs, setObs] = useState<Observation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"sealed" | "revealing" | "open">("sealed");
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    api
      .getObservation(id, true)
      .then(({ observation }) => {
        if (observation.status === "settled") {
          navigate(`/observations/${id}`, { replace: true });
          return;
        }
        if (observation.status === "analyzing") {
          navigate(`/trips/${observation.tripId}`, { replace: true });
          return;
        }
        if (observation.status === "failed") {
          navigate(`/observations/${id}`, { replace: true });
          return;
        }
        setObs(observation);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("settle.failed")));
  }, [id, navigate]);

  function onOpen() {
    setPhase("revealing");
    window.setTimeout(() => setPhase("open"), 700);
  }

  async function onClaim() {
    if (!obs) return;
    setClaiming(true);
    setError(null);
    try {
      await api.settleObservation(obs.id);
      navigate(`/trips/${obs.tripId}`, { replace: true });
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

  return (
    <div className="stack settle-page">
      <div>
        <h1 className="brand">{t("settle.title")}</h1>
        <p className="lede">{t("settle.lede")}</p>
      </div>

      <div className={`settle-card ${phase}`}>
        <div className="settle-card-inner">
          {phase === "sealed" ? (
            <div className="settle-sealed">
              <img src={obs.displayUrl} alt="" className="settle-blur" />
              <button className="btn" type="button" onClick={onOpen}>
                {t("settle.open")}
              </button>
            </div>
          ) : (
            <div className="settle-reveal stack">
              <img src={obs.displayUrl} alt={title} className="settle-hero" />
              {phase === "revealing" ? (
                <p className="muted">{t("settle.opening")}</p>
              ) : (
                <>
                  {obs.rarity ? (
                    <span className={`rarity-badge rarity-${obs.rarity}`}>
                      {rarityLabel(obs.rarity)}
                    </span>
                  ) : null}
                  <strong className="settle-name">{title}</strong>
                  {obs.scientificName ? <span className="muted">{obs.scientificName}</span> : null}
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
                  <button className="btn" type="button" disabled={claiming} onClick={onClaim}>
                    {claiming ? t("settle.claiming") : t("settle.claim")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      <Link className="btn secondary" to={`/trips/${obs.tripId}`}>
        {t("settle.backAlbum")}
      </Link>
    </div>
  );
}
