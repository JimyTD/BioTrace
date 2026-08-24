import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { formatRank, t, type MessageKey } from "@biotrace/messages";
import { acceptedScientificIfDifferent, api, type Observation, type Taxonomy } from "../api";
import { identifyDisplayName } from "../identifyLabel";
import { useBackClose } from "../androidBack";
import ConfirmDialog from "../components/ConfirmDialog";
import ReidentifyDialog from "../components/ReidentifyDialog";
import {
  identifyErrorHint,
  identifyErrorPrimary,
  isNotCollectibleError,
} from "../identifyErrors";
import { hasValidCoords } from "../geo";
import { peekObservation, rememberObservation } from "../pageCache";
import { containedImageBox, playPhotoLift } from "../photoLift";
import {
  clearPhotoLiftHandoff,
  peekLiftBackground,
  peekPhotoLiftHandoff,
  photoLiftReturnPath,
  setPhotoLiftHandoff,
} from "../photoLiftHandoff";

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

function locationText(obs: Observation) {
  if (!hasValidCoords(obs.lat, obs.lng)) return t("detail.noGps");
  return obs.locationLabel || `${obs.lat!.toFixed(5)}, ${obs.lng!.toFixed(5)}`;
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
  const background = peekLiftBackground(location);
  const [obs, setObs] = useState<Observation | null>(() => peekObservation(id));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reidentifying, setReidentifying] = useState(false);
  const [confirmKind, setConfirmKind] = useState<"delete" | "reidentify" | null>(null);
  const [liftOpen] = useState(() => {
    const found = peekPhotoLiftHandoff();
    return found && found.dir === "open" && found.observationId === id ? found : null;
  });
  const pageRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLImageElement | null>(null);
  const liftPlayed = useRef(false);

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
          navigate(`/settle/${id}`, {
            replace: true,
            state: background ? { background } : undefined,
          });
          return;
        }
        setObs(observation);
        rememberObservation(observation);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("detail.loadFailed"));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, navigate, background]);

  useLayoutEffect(() => {
    if (!liftOpen || liftPlayed.current) return;
    const page = pageRef.current;
    const hero = heroRef.current;
    if (!page || !hero) return;
    liftPlayed.current = true;
    clearPhotoLiftHandoff();
    const overlay = page.closest(".page-lift-overlay");
    const fadeEl = overlay instanceof HTMLElement ? overlay : page;
    let cancelled = false;
    void playPhotoLift({
      photoUrl: liftOpen.photoUrl,
      from: liftOpen.box,
      to: () => containedImageBox(hero),
      page: fadeEl,
      hide: hero,
      duration: 480,
      pageFade: "in",
      cancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [liftOpen]);

  useBackClose(() => goBackToAlbum());

  function goBackToAlbum() {
    if (!obs) {
      navigate("/");
      return;
    }
    const origin = liftOpen?.origin ?? { kind: "album" as const, tripId: obs.tripId };
    const hero = heroRef.current;
    if (hero) {
      setPhotoLiftHandoff({
        observationId: obs.id,
        photoUrl: heroUrl(obs),
        box: containedImageBox(hero),
        dir: "close",
        origin,
      });
    }
    navigate(photoLiftReturnPath(origin), {
      state: background?.state,
    });
  }

  useEffect(() => {
    if (!obs || obs.status !== "analyzing") return;
    const timer = window.setInterval(() => {
      void api
        .getObservation(id)
        .then(({ observation }) => {
          if (observation.status === "pending_settle") {
            navigate(`/settle/${id}`, {
              replace: true,
              state: background ? { background } : undefined,
            });
            return;
          }
          setObs(observation);
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [id, obs?.status, navigate, background]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : t("detail.reidentifyFailed"));
    } finally {
      setReidentifying(false);
    }
  }

  if (error && !obs) {
    return (
      <div className="stack detail-page">
        <Link className="text-link" to="/">
          ← {t("nav.trips")}
        </Link>
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!obs && !liftOpen) {
    return <p className="muted">{t("app.loading")}</p>;
  }

  const notCollectible = isNotCollectibleError(obs?.error);
  const title = notCollectible
    ? t("detail.notCollectibleTitle")
    : obs?.commonName || obs?.scientificName || t("detail.unnamed");
  const photoSrc = obs ? heroUrl(obs) : liftOpen?.photoUrl ?? "";
  const busy = deleting || reidentifying || obs?.status === "analyzing";
  const failedCoarse =
    !!obs &&
    !notCollectible &&
    (obs.error === "identify_too_coarse" ||
      (obs.status === "failed" && obs.settleTier === "none"));
  const showTaxonomy =
    !!obs && (obs.status === "settled" || (obs.status === "failed" && !notCollectible));
  const failHint = obs?.status === "failed" ? identifyErrorHint(obs.error) : null;
  const hasCoords = obs ? hasValidCoords(obs.lat, obs.lng) : false;
  const identifyName = obs ? identifyDisplayName(obs.identifyProvider, obs.identifyModel) : null;
  const acceptedSci = obs && !notCollectible ? acceptedScientificIfDifferent(obs) : null;

  return (
    <div className="stack detail-page" ref={pageRef}>
      <div className="album-head-row">
        <button className="text-link" type="button" onClick={goBackToAlbum}>
          ← {t("detail.back")}
        </button>
        <Link className="text-link" to="/map">
          {t("nav.map")}
        </Link>
      </div>

      {photoSrc ? <img className="detail-hero" ref={heroRef} src={photoSrc} alt={title} /> : null}

      {obs ? (
      <>
      <header className="page-head">
        <h1 className="page-title">{title}</h1>
        {!notCollectible && obs.scientificName ? (
          <p className="lede detail-scientific">{obs.scientificName}</p>
        ) : null}
        {acceptedSci ? (
          <p className="muted">{t("detail.acceptedScientificName", { name: acceptedSci })}</p>
        ) : null}
        <div className="detail-marks">
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
          {obs.status === "analyzing" ? (
            <span className="badge warn">{t("status.analyzing")}</span>
          ) : null}
          {obs.status === "failed" ? (
            <span className="badge danger">
              {notCollectible
                ? t("status.notCollectible")
                : failedCoarse
                  ? t("status.tooCoarse")
                  : t("status.failed")}
            </span>
          ) : null}
        </div>
      </header>

      {notice ? <p className="muted">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {obs.status === "failed" ? (
        <div className="detail-fail">
          <p className="error">{identifyErrorPrimary(obs.error)}</p>
          {failHint ? <p className="muted">{failHint}</p> : null}
        </div>
      ) : null}

      {!notCollectible ? (
        <section className="detail-block">
          <h2 className="section-title">{t("detail.blurb")}</h2>
          {obs.blurb ? (
            <p className="blurb">{obs.blurb}</p>
          ) : (
            <p className="muted">{t("detail.noBlurb")}</p>
          )}
          {obs.description ? <p className="muted detail-caption">{obs.description}</p> : null}
        </section>
      ) : obs.description ? (
        <p className="muted detail-caption">{obs.description}</p>
      ) : null}

      {!notCollectible && obs.alertIntroduced ? (
        <div className="alert-banner">
          <strong>{t("settle.alertIntroduced")}</strong>
          <p>{t("settle.alertHint")}</p>
        </div>
      ) : null}

      {showTaxonomy ? (
        <section className="detail-block">
          <h2 className="section-title">{t("detail.taxonomy")}</h2>
          {obs.taxonomy ? (
            <TaxonomyList taxonomy={obs.taxonomy} />
          ) : (
            <p className="muted">{t("detail.noTaxonomy")}</p>
          )}
        </section>
      ) : null}

      <section className="detail-block detail-record">
        <h2 className="section-title">{t("detail.record")}</h2>
        <dl className="detail-facts">
          <div className="detail-fact">
            <dt>{t("detail.capturedAt")}</dt>
            <dd>{obs.capturedAt ? new Date(obs.capturedAt).toLocaleString() : "—"}</dd>
          </div>
          <div className="detail-fact">
            <dt>{t("detail.location")}</dt>
            <dd>
              <span>{locationText(obs)}</span>
              <Link className="btn secondary" to={`/observations/${obs.id}/pin`}>
                {hasCoords ? t("detail.changeLocation") : t("detail.setLocation")}
              </Link>
              {hasCoords && obs.locationLabel ? (
                <span className="muted">
                  {obs.lat!.toFixed(5)}, {obs.lng!.toFixed(5)}
                </span>
              ) : null}
              {!obs.locationPrecise && obs.status === "settled" ? (
                <span className="muted">{t("settle.locationImprecise")}</span>
              ) : null}
            </dd>
          </div>
          {identifyName ? (
            <div className="detail-fact">
              <dt>{t("detail.identify")}</dt>
              <dd>{identifyName}</dd>
            </div>
          ) : null}
          {obs.notes ? (
            <div className="detail-fact">
              <dt>{t("detail.notes")}</dt>
              <dd>{obs.notes}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <div className="detail-danger danger-zone">
        <button
          className="btn secondary"
          type="button"
          disabled={busy}
          onClick={() => setConfirmKind("reidentify")}
        >
          {reidentifying || obs.status === "analyzing"
            ? t("detail.reidentifying")
            : t("detail.reidentify")}
        </button>
        <button
          className="btn secondary danger"
          type="button"
          disabled={deleting || reidentifying}
          onClick={() => setConfirmKind("delete")}
        >
          {deleting ? t("detail.deleting") : t("detail.delete")}
        </button>
      </div>

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
      </>
      ) : (
        <p className="muted">{t("app.loading")}</p>
      )}
    </div>
  );
}
