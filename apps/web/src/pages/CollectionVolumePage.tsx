import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { hasMessage, t } from "@biotrace/messages";
import { api, type VolumeListItem } from "../api";
import { measureBox } from "../motion";
import { playPhotoLift } from "../photoLift";
import {
  clearPhotoLiftHandoff,
  peekPhotoLiftHandoff,
  setPhotoLiftHandoff,
} from "../photoLiftHandoff";
import { peekVolume, rememberVolume } from "../pageCache";
import { volumeCoverUrl, volumeStampFrameUrl } from "../themes";
import { restoreContentScroll, saveContentScroll } from "../scrollMemory";
import {
  clearVolumeOpenHandoff,
  peekVolumeOpenHandoff,
  setVolumeOpenHandoff,
} from "../volumeOpenHandoff";

function msg(key: string) {
  return hasMessage(key) ? t(key) : key;
}

function StampFace({
  photoUrl,
  label,
  lit,
}: {
  photoUrl: string | null;
  label: string;
  lit: boolean;
}) {
  return (
    <div className={`stamp-face${lit ? " is-lit" : ""}`}>
      <div className="stamp-photo">
        {photoUrl ? (
          <img src={photoUrl} alt={label} />
        ) : (
          <span className="stamp-photo-empty" aria-hidden />
        )}
      </div>
      <img className="stamp-frame" src={volumeStampFrameUrl()} alt="" aria-hidden />
    </div>
  );
}

export default function CollectionVolumePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [volume, setVolume] = useState<VolumeListItem | null>(() => peekVolume(id));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !peekVolume(id));
  const [liftSourceId, setLiftSourceId] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLImageElement | null>(null);
  const openPlayed = useRef(false);
  const returnPlayed = useRef(false);
  const [opening] = useState(() => {
    const found = peekVolumeOpenHandoff();
    return found && found.dir === "open" && found.volumeId === id ? found : null;
  });
  const [returning] = useState(() => {
    const found = peekPhotoLiftHandoff();
    return found &&
      found.dir === "close" &&
      found.origin.kind === "volume" &&
      found.origin.volumeId === id
      ? found
      : null;
  });

  useEffect(() => {
    const hit = peekVolume(id);
    if (hit) {
      setVolume(hit);
      setLoading(false);
    } else {
      setVolume(null);
      setLoading(true);
    }
    api
      .listVolumes()
      .then((res) => {
        for (const item of res.volumes) rememberVolume(item);
        const found = res.volumes.find((v) => v.id === id) ?? null;
        setVolume(found);
        if (!found) setError(t("collection.volumesLoadFailed"));
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.volumesLoadFailed")))
      .finally(() => setLoading(false));
  }, [id]);

  useLayoutEffect(() => {
    if (!opening || openPlayed.current) return;
    const page = pageRef.current;
    const cover = coverRef.current;
    if (!page || !cover) return;
    openPlayed.current = true;
    clearVolumeOpenHandoff();
    let cancelled = false;
    void playPhotoLift({
      photoUrl: opening.coverUrl,
      from: opening.box,
      to: () => measureBox(cover),
      page,
      hide: cover,
      duration: 420,
      cancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
      openPlayed.current = false;
    };
  }, [opening]);

  useLayoutEffect(() => {
    if (!volume) return;
    restoreContentScroll(`volume:${id}`);
    if (!returning || returnPlayed.current) return;
    const face = document.querySelector<HTMLElement>(
      `.stamp[data-obs-id="${returning.observationId}"] .stamp-face`,
    );
    const page = pageRef.current;
    if (!face || !page) return;
    returnPlayed.current = true;
    clearPhotoLiftHandoff();
    setLiftSourceId(returning.observationId);
    let cancelled = false;
    void playPhotoLift({
      photoUrl: returning.photoUrl,
      from: returning.box,
      to: () => measureBox(face),
      page,
      hide: face,
      duration: 380,
      pageFade: "none",
      cancelled: () => cancelled,
    }).then(() => {
      if (!cancelled) setLiftSourceId(null);
    });
    return () => {
      cancelled = true;
      returnPlayed.current = false;
    };
  }, [returning, volume, id]);

  function goBackToShelf() {
    const cover = coverRef.current;
    if (cover) {
      setVolumeOpenHandoff({
        volumeId: id,
        coverUrl: volumeCoverUrl(id),
        box: measureBox(cover),
        dir: "close",
      });
    }
    navigate("/collection");
  }

  function openStamp(observationId: string, photoUrl: string, face: HTMLElement) {
    saveContentScroll(`volume:${id}`);
    setPhotoLiftHandoff({
      observationId,
      photoUrl,
      box: measureBox(face),
      dir: "open",
      origin: { kind: "volume", volumeId: id },
    });
    navigate(`/observations/${observationId}`);
  }

  return (
    <div className="stack page-collection-volume" ref={pageRef}>
      <header className="page-head me-sub-head">
        <button className="text-link" type="button" onClick={goBackToShelf}>
          ← {t("collection.volumeBack")}
        </button>
        <div className="volume-head">
          <img
            className="volume-head-cover"
            ref={coverRef}
            src={volumeCoverUrl(id)}
            alt=""
          />
          {volume ? (
            <div>
              <h1 className="page-title">{msg(volume.titleKey)}</h1>
              <p className="lede">{msg(volume.ledeKey)}</p>
              <p className="muted">
                {volume.completed
                  ? t("collection.volumeDone")
                  : t("collection.volumeProgress", {
                      lit: volume.litCount,
                      total: volume.totalSlots,
                    })}
              </p>
            </div>
          ) : (
            <h1 className="page-title">{t("collection.title")}</h1>
          )}
        </div>
      </header>

      {loading && !volume ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {volume ? (
        <div className="stamp-grid">
          {volume.slots.map((slot) => {
            const label = msg(slot.titleKey);
            const photoUrl = slot.lit ? slot.coverDisplayUrl : null;
            const face = <StampFace photoUrl={photoUrl} label={label} lit={slot.lit} />;
            const sourceHidden = liftSourceId === slot.coverObservationId;

            if (slot.lit && slot.coverObservationId && photoUrl) {
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={`stamp stamp-lit${sourceHidden ? " is-lift-source" : ""}`}
                  data-obs-id={slot.coverObservationId}
                  aria-label={t("collection.stampLift")}
                  onPointerDown={(e) => {
                    const media = e.currentTarget.querySelector(".stamp-face");
                    if (!(media instanceof HTMLElement)) return;
                    setPhotoLiftHandoff({
                      observationId: slot.coverObservationId!,
                      photoUrl,
                      box: measureBox(media),
                      dir: "open",
                      origin: { kind: "volume", volumeId: id },
                    });
                  }}
                  onClick={(e) => {
                    const media = e.currentTarget.querySelector(".stamp-face");
                    if (!(media instanceof HTMLElement)) return;
                    openStamp(slot.coverObservationId!, photoUrl, media);
                  }}
                >
                  {face}
                  <span className="stamp-caption">{label}</span>
                </button>
              );
            }

            return (
              <div
                key={slot.id}
                className={`stamp${slot.lit ? " stamp-lit" : " stamp-empty"}`}
                title={slot.lit ? label : t("collection.volumeStampEmpty")}
              >
                {face}
                <span className="stamp-caption">{label}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
