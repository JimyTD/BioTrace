import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { formatRank, t, type MessageKey } from "@biotrace/messages";
import { api, type Observation, type Taxonomy } from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import ReidentifyDialog from "../components/ReidentifyDialog";
import {
  identifyErrorHint,
  identifyErrorPrimary,
  isNotCollectibleError,
} from "../identifyErrors";
import { hasValidCoords } from "../geo";

function heroUrl(obs: Observation): string {
  const original = obs.originalUrl;
  if (original && /\.(jpe?g|png|webp)(\?|$)/i.test(original)) return original;
  return obs.displayUrl;
}

const RANK_ORDER = [
  "kingdom",
  "phylum",
  "class",
  "order",
  "family",
  "genus",
  "species",
] as const;

function rankLabel(rank: (typeof RANK_ORDER)[number]) {
  return t(`rank.${rank}` as MessageKey);
}

function TaxonomyList({ taxonomy }: { taxonomy: Taxonomy }) {
  const rows = RANK_ORDER.map((rank) => {
    const node = taxonomy[rank];
    if (!node?.name_la && !node?.name_zh) return null;
    const primary = node.name_zh || node.name_la || "";
    const secondary = node.name_zh && node.name_la ? node.name_la : null;
    return (
      <li key={rank}>
        <span className="tax-rank">{rankLabel(rank)}</span>
        <span className="tax-name">
          {primary}
          {secondary ? <span className="muted"> · {secondary}</span> : null}
        </span>
      </li>
    );
  }).filter(Boolean);

  if (rows.length === 0) {
    return <p className="muted">{t("detail.noTaxonomy")}</p>;
  }

  return <ol className="taxonomy-chain">{rows}</ol>;
}

export default function ObservationDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [obs, setObs] = useState<Observation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reidentifying, setReidentifying] = useState(false);
  const [confirmKind, setConfirmKind] = useState<"delete" | "reidentify" | null>(null);

  useEffect(() => {
    const state = location.state as { locationSaved?: boolean } | null;
    if (state?.locationSaved) {
      setNotice(t("detail.locationSaved"));
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { observation } = await api.getObservation(id);
        if (cancelled) return;
        if (observation.status === "pending_settle") {
          navigate(`/settle/${id}`, { replace: true });
          return;
        }
        setObs(observation);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("detail.loadFailed"));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  useEffect(() => {
    if (!obs || obs.status !== "analyzing") return;
    const timer = window.setInterval(() => {
      void api
        .getObservation(id)
        .then(({ observation }) => {
          if (observation.status === "pending_settle") {
            navigate(`/settle/${id}`, { replace: true });
            return;
          }
          setObs(observation);
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [id, obs?.status, navigate]);

  async function confirmDelete() {
    if (!obs) return;
    setDeleting(true);
    try {
      await api.deleteObservation(obs.id);
      setConfirmKind(null);
      navigate(`/trips/${obs.tripId}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("detail.deleteFailed"));
      setDeleting(false);
    }
  }

  async function confirmReidentify(description: string) {
    if (!obs) return;
    setReidentifying(true);
    setError(null);
    try {
      const { observation } = await api.reidentifyObservation(obs.id, description);
      setConfirmKind(null);
      setObs(observation);
      // Stay on same observation; after done it will go pending_settle → settle page via poll
    } catch (e) {
      setError(e instanceof Error ? e.message : t("detail.reidentifyFailed"));
    } finally {
      setReidentifying(false);
    }
  }

  if (error && !obs) {
    return (
      <div className="stack">
        <Link className="btn secondary" to="/">
          {t("detail.back")}
        </Link>
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!obs) {
    return <p className="muted">{t("app.loading")}</p>;
  }

  const notCollectible = isNotCollectibleError(obs.error);
  const title = notCollectible
    ? t("detail.notCollectibleTitle")
    : obs.commonName || obs.scientificName || t("detail.unnamed");
  const busy = deleting || reidentifying || obs.status === "analyzing";
  const failedCoarse =
    !notCollectible &&
    (obs.error === "identify_too_coarse" ||
      (obs.status === "failed" && obs.settleTier === "none"));
  const showTaxonomy = obs.status === "settled" || (obs.status === "failed" && !notCollectible);
  const failHint = obs.status === "failed" ? identifyErrorHint(obs.error) : null;

  return (
    <div className="stack detail-page">
      <div className="row">
        <Link className="btn secondary" to={`/trips/${obs.tripId}`}>
          {t("detail.back")}
        </Link>
        <Link className="btn secondary" to="/map">
          {t("nav.map")}
        </Link>
      </div>

      <div>
        <h1 className="brand">{title}</h1>
        {!notCollectible && obs.scientificName ? (
          <p className="lede">{obs.scientificName}</p>
        ) : null}
        {obs.identifyProvider ? (
          <p className="muted identify-by">
            {t("identify.by", {
              name: (() => {
                const key = `identify.provider.${obs.identifyProvider}` as MessageKey;
                const name = t(key);
                return name === key ? obs.identifyProvider : name;
              })(),
            })}
          </p>
        ) : null}
      </div>

      <img className="detail-hero" src={heroUrl(obs)} alt={title} />

      <div className="panel stack">
        <div className="row">
          {obs.status === "analyzing" ? (
            <span className="badge warn">{t("status.analyzing")}</span>
          ) : null}
          {obs.status === "settled" ? <span className="badge">{t("status.settled")}</span> : null}
          {obs.status === "failed" ? (
            <span className="badge danger">
              {notCollectible
                ? t("status.notCollectible")
                : failedCoarse
                  ? t("status.tooCoarse")
                  : t("status.failed")}
            </span>
          ) : null}
          {!notCollectible && obs.rarity ? (
            <span className={`rarity-badge rarity-${obs.rarity}`}>
              {t(`rarity.${obs.rarity}` as MessageKey)}
            </span>
          ) : null}
          {!notCollectible && obs.finestReliableRank ? (
            <span className="muted">
              {t("album.reliableTo", { rank: formatRank(obs.finestReliableRank) })}
            </span>
          ) : null}
        </div>

        {obs.status === "failed" ? (
          <div className="stack" style={{ gap: 4 }}>
            <p className="error">{identifyErrorPrimary(obs.error)}</p>
            {failHint ? <p className="muted">{failHint}</p> : null}
          </div>
        ) : null}

        {!notCollectible && obs.alertIntroduced ? (
          <div className="alert-banner">
            <strong>{t("settle.alertIntroduced")}</strong>
            <p>{t("settle.alertHint")}</p>
          </div>
        ) : null}

        {!obs.locationPrecise && obs.status === "settled" ? (
          <p className="muted">{t("settle.locationImprecise")}</p>
        ) : null}

        {showTaxonomy ? (
          <div>
            <h2 className="section-title">{t("detail.taxonomy")}</h2>
            {obs.taxonomy ? (
              <TaxonomyList taxonomy={obs.taxonomy} />
            ) : (
              <p className="muted">{t("detail.noTaxonomy")}</p>
            )}
          </div>
        ) : null}

        {!notCollectible ? (
          <div>
            <h2 className="section-title">{t("detail.blurb")}</h2>
            {obs.blurb ? (
              <p className="blurb">{obs.blurb}</p>
            ) : (
              <p className="muted">{t("detail.noBlurb")}</p>
            )}
          </div>
        ) : null}

        {!notCollectible && obs.notes ? (
          <div>
            <h2 className="section-title">{t("detail.notes")}</h2>
            <p className="muted">{obs.notes}</p>
          </div>
        ) : null}

        <div className="muted stack" style={{ gap: 4 }}>
          <span>
            {t("detail.capturedAt")}：
            {obs.capturedAt ? new Date(obs.capturedAt).toLocaleString() : "—"}
          </span>
          <div className="row" style={{ alignItems: "center" }}>
            <span className="stack" style={{ gap: 2, flex: 1 }}>
              <span>
                {t("detail.location")}：
                {hasValidCoords(obs.lat, obs.lng)
                  ? obs.locationLabel ||
                    `${obs.lat!.toFixed(5)}, ${obs.lng!.toFixed(5)}`
                  : t("detail.noGps")}
              </span>
              {hasValidCoords(obs.lat, obs.lng) && obs.locationLabel ? (
                <span className="muted" style={{ fontSize: "0.85em" }}>
                  {obs.lat!.toFixed(5)}, {obs.lng!.toFixed(5)}
                </span>
              ) : null}
            </span>
            <Link
              className={hasValidCoords(obs.lat, obs.lng) ? "btn secondary" : "btn"}
              to={`/observations/${obs.id}/pin`}
            >
              {hasValidCoords(obs.lat, obs.lng)
                ? t("detail.changeLocation")
                : t("detail.setLocation")}
            </Link>
          </div>
        </div>
      </div>

      <div className="row">
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => setConfirmKind("reidentify")}
        >
          {reidentifying || obs.status === "analyzing"
            ? t("detail.reidentifying")
            : t("detail.reidentify")}
        </button>
        <button
          className="btn danger"
          disabled={deleting || reidentifying}
          onClick={() => setConfirmKind("delete")}
        >
          {deleting ? t("detail.deleting") : t("detail.delete")}
        </button>
      </div>
      {notice ? <p className="muted">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <ConfirmDialog
        open={confirmKind === "delete"}
        title={t("common.confirmTitle")}
        message={t("detail.deleteConfirm")}
        confirmLabel={t("detail.delete")}
        danger
        busy={deleting}
        onCancel={() => {
          if (!deleting) setConfirmKind(null);
        }}
        onConfirm={confirmDelete}
      />
      <ReidentifyDialog
        open={confirmKind === "reidentify"}
        busy={reidentifying}
        initialDescription={obs.description}
        onCancel={() => {
          if (!reidentifying) setConfirmKind(null);
        }}
        onConfirm={confirmReidentify}
      />
    </div>
  );
}
