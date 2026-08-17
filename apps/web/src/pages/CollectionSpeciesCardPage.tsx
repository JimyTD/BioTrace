import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { matchPath, useLocation, useNavigate, useParams } from "react-router-dom";
import { hasMessage, t, type MessageKey } from "@biotrace/messages";
import { api, type CollectionEntry, type CollectionSighting, type Rarity } from "../api";
import { measureBox } from "../motion";
import { playPhotoLift } from "../photoLift";
import {
  clearPhotoLiftHandoff,
  liftBackgroundState,
  peekPhotoLiftHandoff,
  setPhotoLiftHandoff,
} from "../photoLiftHandoff";
import { restoreNamedScroll, saveNamedScroll } from "../scrollMemory";
import { useRealLocation } from "../realLocation";
import { speciesEntryName } from "../speciesSearch";

function rarityLabel(r: Rarity) {
  const key = `rarity.${r}`;
  return hasMessage(key) ? t(key as MessageKey) : r;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function treeReturnPath(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from.startsWith("/collection/tree") ? from : null;
}

export default function CollectionSpeciesCardPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const real = useRealLocation();
  const onThisCard = Boolean(
    real && matchPath("/collection/species/:id", real.pathname)?.params.id === id,
  );
  const [entry, setEntry] = useState<CollectionEntry | null>(null);
  const [sightings, setSightings] = useState<CollectionSighting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [liftSourceId, setLiftSourceId] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const returnPlayed = useRef(false);
  const scrollRestoredFor = useRef<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getCollectionEntry(id)
      .then((res) => {
        setEntry(res.entry);
        setSightings(res.sightings);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.speciesLoadFailed")))
      .finally(() => setLoading(false));
  }, [id]);

  useLayoutEffect(() => {
    if (!onThisCard || !entry) {
      if (!onThisCard) {
        returnPlayed.current = false;
        scrollRestoredFor.current = null;
      }
      return;
    }
    if (scrollRestoredFor.current !== id) {
      restoreNamedScroll(`species:${id}`, ".page-lift-overlay.is-species");
      scrollRestoredFor.current = id;
    }
    if (returnPlayed.current) return;
    const found = peekPhotoLiftHandoff();
    if (
      !found ||
      found.dir !== "close" ||
      found.origin.kind !== "species" ||
      found.origin.entryId !== id
    ) {
      return;
    }
    const face =
      document.querySelector<HTMLElement>(
        `.species-sighting[data-obs-id="${found.observationId}"] .species-sighting-photo`,
      ) ??
      document.querySelector<HTMLElement>(
        `.species-card-cover[data-obs-id="${found.observationId}"]`,
      );
    const page = pageRef.current;
    if (!face || !page) return;
    returnPlayed.current = true;
    clearPhotoLiftHandoff();
    setLiftSourceId(found.observationId);
    let cancelled = false;
    void playPhotoLift({
      photoUrl: found.photoUrl,
      from: found.box,
      to: () => measureBox(face),
      page,
      hide: face,
      duration: 380,
      pageFade: "none",
      cancelled: () => cancelled,
      onLanded: () => {
        if (!cancelled) flushSync(() => setLiftSourceId(null));
      },
    });
    return () => {
      cancelled = true;
    };
  }, [onThisCard, entry, id]);

  function openSighting(observationId: string, photoUrl: string, media: HTMLElement) {
    saveNamedScroll(`species:${id}`, ".page-lift-overlay.is-species");
    setPhotoLiftHandoff({
      observationId,
      photoUrl,
      box: measureBox(media),
      dir: "open",
      origin: { kind: "species", entryId: id },
    });
    navigate(`/observations/${observationId}`, { state: liftBackgroundState(location) });
  }

  const fromTree = treeReturnPath(location.state);
  const title = entry ? speciesEntryName(entry, t("detail.unnamed")) : t("collection.speciesTitle");

  return (
    <div className="stack page-species-card" ref={pageRef}>
      <header className="page-head me-sub-head">
        <button
          className="text-link"
          type="button"
          onClick={() => navigate(fromTree ?? "/collection/species")}
        >
          ← {fromTree ? t("collection.treeTitle") : t("collection.speciesTitle")}
        </button>
        <h1 className="page-title">{title}</h1>
        {entry?.scientificName && entry.commonName ? (
          <p className="lede detail-scientific">{entry.scientificName}</p>
        ) : null}
      </header>

      {loading && !entry ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {entry ? (
        <>
          {entry.coverDisplayUrl && entry.coverObservationId ? (
            <button
              type="button"
              className={`species-card-cover${liftSourceId === entry.coverObservationId ? " is-lift-source" : ""}`}
              data-obs-id={entry.coverObservationId}
              aria-label={t("collection.stampLift")}
              onPointerDown={(e) => {
                setPhotoLiftHandoff({
                  observationId: entry.coverObservationId!,
                  photoUrl: entry.coverDisplayUrl!,
                  box: measureBox(e.currentTarget),
                  dir: "open",
                  origin: { kind: "species", entryId: id },
                });
              }}
              onClick={(e) =>
                openSighting(entry.coverObservationId!, entry.coverDisplayUrl!, e.currentTarget)
              }
            >
              <img src={entry.coverDisplayUrl} alt="" />
            </button>
          ) : entry.coverDisplayUrl ? (
            <div className="species-card-cover">
              <img src={entry.coverDisplayUrl} alt="" />
            </div>
          ) : null}

          <div className="species-card-marks">
            <span className={`rarity-badge rarity-${entry.rarity}`}>{rarityLabel(entry.rarity)}</span>
            <span className="muted">
              {t("collection.speciesFirstCollected", { date: shortDate(entry.firstCollectedAt) })}
            </span>
            {entry.alertIntroduced ? (
              <span className="muted">{t("settle.alertIntroduced")}</span>
            ) : null}
          </div>

          <h2 className="section-title">{t("collection.speciesSightings")}</h2>
          {sightings.length === 0 ? (
            <p className="muted">{t("collection.empty")}</p>
          ) : (
            <div className="species-sightings">
              {sightings.map((item) => (
                <button
                  key={item.observationId}
                  type="button"
                  className={`species-sighting${liftSourceId === item.observationId ? " is-lift-source" : ""}`}
                  data-obs-id={item.observationId}
                  aria-label={t("collection.stampLift")}
                  onPointerDown={(e) => {
                    const media = e.currentTarget.querySelector(".species-sighting-photo");
                    if (!(media instanceof HTMLElement)) return;
                    setPhotoLiftHandoff({
                      observationId: item.observationId,
                      photoUrl: item.displayUrl,
                      box: measureBox(media),
                      dir: "open",
                      origin: { kind: "species", entryId: id },
                    });
                  }}
                  onClick={(e) => {
                    const media = e.currentTarget.querySelector(".species-sighting-photo");
                    if (!(media instanceof HTMLElement)) return;
                    openSighting(item.observationId, item.displayUrl, media);
                  }}
                >
                  <img className="species-sighting-photo" src={item.displayUrl} alt="" />
                  {item.tripTitle ? <strong>{item.tripTitle}</strong> : null}
                  <span className="muted">{shortDate(item.occurredAt)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
