import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { matchPath, useLocation, useNavigate, useParams } from "react-router-dom";
import { t, type MessageKey } from "@biotrace/messages";
import { api, type CollectionSighting, type PetCollectionEntry } from "../api";
import { useBackClose } from "../androidBack";
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

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function prevalenceKey(p: PetCollectionEntry["breeds"][number]["prevalence"]): MessageKey {
  if (p === "uncommon") return "collection.prevalence.uncommon";
  if (p === "rare") return "collection.prevalence.rare";
  return "collection.prevalence.common";
}

export default function CollectionPetCardPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const real = useRealLocation();
  const onThisCard = Boolean(
    real && matchPath("/collection/pets/:id", real.pathname)?.params.id === id,
  );
  const [entry, setEntry] = useState<PetCollectionEntry | null>(null);
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
      .getPetCollectionEntry(id)
      .then((res) => {
        setEntry(res.entry);
        setSightings(res.sightings);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.petsLoadFailed")))
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
      restoreNamedScroll(`pets:${id}`, ".page-lift-overlay.is-species");
      scrollRestoredFor.current = id;
    }
    if (returnPlayed.current) return;
    const found = peekPhotoLiftHandoff();
    if (
      !found ||
      found.dir !== "close" ||
      found.origin.kind !== "pets" ||
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
    saveNamedScroll(`pets:${id}`, ".page-lift-overlay.is-species");
    setPhotoLiftHandoff({
      observationId,
      photoUrl,
      box: measureBox(media),
      dir: "open",
      origin: { kind: "pets", entryId: id },
    });
    navigate(`/observations/${observationId}`, { state: liftBackgroundState(location) });
  }

  useBackClose(() => navigate("/collection/pets"));
  const title = entry ? speciesEntryName(entry, t("detail.unnamed")) : t("collection.petsTitle");

  return (
    <div className="stack page-species-card" ref={pageRef}>
      <header className="page-head me-sub-head">
        <button className="text-link" type="button" onClick={() => navigate("/collection/pets")}>
          ← {t("collection.petsTitle")}
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
                  origin: { kind: "pets", entryId: id },
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
            <span className="muted">
              {t("collection.speciesFirstCollected", { date: shortDate(entry.firstCollectedAt) })}
            </span>
          </div>

          <h2 className="section-title">{t("collection.petsBreeds")}</h2>
          <div className="pet-breed-grid">
            <div
              className={`pet-breed-cell${entry.unregisteredLit ? " is-lit" : ""}`}
              aria-label={t("collection.petsUnregistered")}
            >
              {t("collection.petsUnregistered")}
            </div>
            {entry.breeds.map((breed) => (
              <div
                key={breed.id}
                className={`pet-breed-cell is-${breed.prevalence}${breed.lit ? " is-lit" : ""}`}
                aria-label={`${breed.zh} ${t(prevalenceKey(breed.prevalence))}`}
              >
                {breed.zh}
              </div>
            ))}
          </div>

          <h2 className="section-title">{t("collection.speciesSightings")}</h2>
          {sightings.length === 0 ? (
            <p className="muted">{t("collection.petsEmpty")}</p>
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
                      origin: { kind: "pets", entryId: id },
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
