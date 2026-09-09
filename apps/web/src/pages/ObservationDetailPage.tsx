import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { formatRank, t, type MessageKey } from "@biotrace/messages";
import { acceptedScientificIfDifferent, api, type Observation, type Taxonomy } from "../api";
import { identifyDisplayName } from "../identifyLabel";
import { useBackClose } from "../androidBack";
import ConfirmDialog from "../components/ConfirmDialog";
import { ListTagRow } from "../components/ListTagRow";
import ReidentifyDialog from "../components/ReidentifyDialog";
import {
  identifyErrorHint,
  identifyErrorPrimary,
  isKeepsakeError,
  isNotAFault,
  isNotCollectibleError,
  isSoftEncounterError,
} from "../identifyErrors";
import SoftEncounterSeal from "../components/SoftEncounterSeal";
import KeepsakeSeal from "../components/KeepsakeSeal";
import { hasValidCoords } from "../geo";
import { peekObservation, rememberObservation } from "../pageCache";
import { containedImageBox, decodeIfSimilarAspect, playPhotoLift } from "../photoLift";
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

/**
 * 软档理由句：识图作业把模型的 ineligibility_reason_zh 写进 notes 首段。
 * 「影像/标本」分型在落库时没有单独字段，这里按 notes 内容回读分型；
 * 分不出就用通用句，不猜。
 */
function softReasonText(obs: Observation): string {
  const notes = (obs.notes ?? "").trim();
  const generic = t("detail.softReasonGeneric");
  if (!notes) return generic;
  const reasonMatch = notes.match(/^([^·]+)(?:\s*·\s*(.*))?$/);
  const reason = reasonMatch?.[1]?.trim() ?? "";
  const rest = reasonMatch?.[2]?.trim() ?? "";
  const kindLine = `${reason} ${rest}`;
  if (/标本/.test(kindLine)) {
    return reason ? t("detail.softReasonSpecimen", { reason }) : t("detail.softReasonSpecimen", { reason: t("error.identifySoftDefaultReason") });
  }
  if (/影像|画布|油画|画作|挂画|海报|屏幕|书页|印刷|照片|直播|描绘/.test(kindLine)) {
    return reason ? t("detail.softReasonDepiction", { reason }) : t("detail.softReasonDepiction", { reason: t("error.identifySoftDefaultReason") });
  }
  return generic;
}

/**
 * 留影档的「简介」：这类照片没有科普短文，但识图 agent 一定给了
 * 不合格理由（「看起来是个普通茶杯，没有找到生物」那类话），落库时
 * 写进 notes 首段。这里回读出来当这张照片的注——总比「暂无简介」强。
 * 万一 notes 空（老数据或 agent 真没给），回落到一句中性的兜底话。
 */
function keepsakeReasonText(obs: Observation): string {
  const notes = (obs.notes ?? "").trim();
  if (notes) return notes;
  return t("detail.keepsakeReasonFallback");
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

export default function ObservationDetailPage({ userId }: { userId?: string }) {
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
  const [heroSrc, setHeroSrc] = useState(() => {
    if (liftOpen) return liftOpen.photoUrl;
    const cached = peekObservation(id);
    return cached ? heroUrl(cached) : "";
  });
  const pageRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLImageElement | null>(null);
  const liftPlayed = useRef(false);
  const [liftLanded, setLiftLanded] = useState(false);

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

  useEffect(() => {
    if (!obs || liftOpen) return;
    setHeroSrc(heroUrl(obs));
  }, [obs, liftOpen]);

  useEffect(() => {
    if (!liftOpen || !obs) return;
    const next = heroUrl(obs);
    if (!next || next === liftOpen.photoUrl) return;
    const prefetch = new Image();
    prefetch.src = next;
  }, [liftOpen, obs]);

  useEffect(() => {
    if (!liftOpen || !liftLanded || !obs) return;
    const next = heroUrl(obs);
    if (!next || next === heroSrc) return;
    let cancelled = false;
    const box = heroRef.current;
    void decodeIfSimilarAspect(
      next,
      box ? { width: box.naturalWidth, height: box.naturalHeight } : null,
    ).then((url) => {
      if (!cancelled && url) setHeroSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [liftOpen, liftLanded, obs, heroSrc]);

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
    }).then(() => {
      if (!cancelled) setLiftLanded(true);
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
        photoUrl: hero.currentSrc || hero.src || heroSrc || heroUrl(obs),
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
      rememberObservation(observation);
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

  /** 不进图鉴：老硬拦码 + 留影（都不结算、不进图鉴）。软档不在内——软档的
      物种是认出来的，只是不计入相遇，所以归在下面的 noCollection。 */
  const noCatalogEntry = isNotCollectibleError(obs?.error) || isKeepsakeError(obs?.error);
  const softEncounter = isSoftEncounterError(obs?.error);
  const keepsake = isKeepsakeError(obs?.error);
  /** 软档、硬拦与留影都「不进图鉴」，但软档与留影都保留身份字段 */
  const noCollection = noCatalogEntry || softEncounter || keepsake;
  /** 展示层统一取标题：留影档用 agent 短名，其余回落到物种名（见留影档设计方案 §5） */
  const title =
    obs?.commonName || obs?.scientificName || t("detail.unnamed");
  const photoSrc = heroSrc || liftOpen?.photoUrl || (obs ? heroUrl(obs) : "");
  const busy = deleting || reidentifying || obs?.status === "analyzing";
  const failedCoarse =
    !!obs &&
    !noCatalogEntry &&
    !softEncounter &&
    (obs.error === "identify_too_coarse" ||
      (obs.status === "failed" && obs.settleTier === "none"));
  const showTaxonomy =
    !!obs &&
    (obs.status === "settled" || (obs.status === "failed" && !noCatalogEntry)) &&
    /* 留影档没有分类阶元（taxonomy 全 null），标题与理由已足够，不摆空表 */
    !keepsake;
  const failHint = obs?.status === "failed" ? identifyErrorHint(obs.error) : null;
  const hasCoords = obs ? hasValidCoords(obs.lat, obs.lng) : false;
  const identifyName = obs ? identifyDisplayName(obs.identifyProvider, obs.identifyModel) : null;
  const acceptedSci = obs && !noCollection ? acceptedScientificIfDifferent(obs) : null;

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
        {!noCatalogEntry && obs.scientificName ? (
          <p className="lede detail-scientific">{obs.scientificName}</p>
        ) : null}
        {acceptedSci ? (
          <p className="muted">{t("detail.acceptedScientificName", { name: acceptedSci })}</p>
        ) : null}
        <div className="detail-marks">
          {keepsake ? <KeepsakeSeal /> : null}
          {softEncounter ? <SoftEncounterSeal /> : null}
          {!noCollection && obs.rarity ? (
            <span className={`rarity-badge rarity-${obs.rarity}`}>
              {t(`rarity.${obs.rarity}` as MessageKey)}
            </span>
          ) : null}
          {!noCatalogEntry && obs.finestReliableRank ? (
            <span className="muted">
              {t("album.reliableTo", { rank: formatRank(obs.finestReliableRank) })}
            </span>
          ) : null}
          {obs.status === "analyzing" ? (
            <span className="badge warn">{t("status.analyzing")}</span>
          ) : null}
          {obs.status === "failed" ? (
            <span className={isNotAFault(obs.error) ? "badge soft" : "badge danger"}>
              {/* 留影 status=settled 走不到这里；此处只管老硬拦码与太粗。
                  留影的「不在册」由上面的 KeepsakeSeal 与 status.keepsake 承担 */}
              {isNotCollectibleError(obs.error)
                ? t("status.notCollectible")
                : failedCoarse
                  ? t("status.tooCoarse")
                  : t("status.failed")}
            </span>
          ) : null}
          {keepsake ? <span className="badge soft">{t("status.keepsake")}</span> : null}
        </div>
        <ListTagRow tags={noCollection && !softEncounter ? [] : obs.tags} />
      </header>

      {notice ? <p className="muted">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {obs.status === "failed" ? (
        <div className="detail-fail">
          <p className={isNotAFault(obs.error) ? "muted" : "error"}>
            {identifyErrorPrimary(obs.error)}
          </p>
          {failHint ? <p className="muted">{failHint}</p> : null}
        </div>
      ) : null}

      {softEncounter && obs ? (
        <div className="detail-soft-reason">
          <p className="muted">{t("detail.softReasonTitle")}</p>
          <p className="detail-soft-reason-text">{softReasonText(obs)}</p>
        </div>
      ) : null}

      {keepsake ? (
        <section className="detail-block">
          <h2 className="section-title">{t("detail.blurb")}</h2>
          {/* 留影没有科普简介，但识图 agent 一定给了不合格理由；那句话就是这张的注 */}
          <p className="blurb">{keepsakeReasonText(obs)}</p>
          {obs.description ? <p className="muted detail-caption">{obs.description}</p> : null}
        </section>
      ) : !noCatalogEntry ? (
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
          {obs.uploaderName ? (
            <div className="detail-fact">
              <dt>{t("detail.uploader")}</dt>
              <dd>{userId && obs.userId === userId ? t("share.you") : obs.uploaderName}</dd>
            </div>
          ) : null}
          <div className="detail-fact">
            <dt>{t("detail.capturedAt")}</dt>
            <dd>{obs.capturedAt ? new Date(obs.capturedAt).toLocaleString() : "—"}</dd>
          </div>
          {obs.domesticated && obs.breedZh ? (
            <div className="detail-fact">
              <dt>{t("detail.breed")}</dt>
              <dd>{obs.breedZh}</dd>
            </div>
          ) : null}
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

      {userId && obs.userId === userId ? (
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
      ) : null}

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
