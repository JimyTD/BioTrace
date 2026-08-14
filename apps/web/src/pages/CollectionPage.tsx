import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { hasMessage, t } from "@biotrace/messages";
import { api, type VolumeListItem } from "../api";
import { measureBox } from "../motion";
import { playPhotoLift } from "../photoLift";
import { volumeCoverUrl, volumeSealCompleteUrl } from "../themes";
import {
  clearVolumeOpenHandoff,
  peekVolumeOpenHandoff,
  setVolumeOpenHandoff,
} from "../volumeOpenHandoff";

function msg(key: string) {
  return hasMessage(key) ? t(key) : key;
}

export default function CollectionPage() {
  const navigate = useNavigate();
  const [entryCount, setEntryCount] = useState(0);
  const [volumes, setVolumes] = useState<VolumeListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const returnPlayed = useRef(false);
  const [returning] = useState(() => {
    const found = peekVolumeOpenHandoff();
    return found && found.dir === "close" ? found : null;
  });

  useEffect(() => {
    Promise.all([api.listCollection(), api.listVolumes()])
      .then(([col, vol]) => {
        setEntryCount(col.entries.length);
        setVolumes(vol.volumes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  useLayoutEffect(() => {
    if (!returning || loading || returnPlayed.current) return;
    const cover = document.querySelector<HTMLElement>(
      `.volume-tile[data-volume-id="${returning.volumeId}"] .volume-tile-cover`,
    );
    const page = pageRef.current;
    if (!cover || !page) return;
    returnPlayed.current = true;
    clearVolumeOpenHandoff();
    setSourceId(returning.volumeId);
    let cancelled = false;
    void playPhotoLift({
      photoUrl: returning.coverUrl,
      from: returning.box,
      to: measureBox(cover),
      page,
      hide: cover,
      duration: 380,
      pageFade: "none",
      cancelled: () => cancelled,
    }).then(() => {
      if (!cancelled) setSourceId(null);
    });
    return () => {
      cancelled = true;
      returnPlayed.current = false;
    };
  }, [returning, loading, volumes]);

  function openVolume(vol: VolumeListItem, coverEl: HTMLElement | null) {
    if (coverEl) {
      setVolumeOpenHandoff({
        volumeId: vol.id,
        coverUrl: volumeCoverUrl(vol.id),
        box: measureBox(coverEl),
        dir: "open",
      });
    }
    navigate(`/collection/volumes/${vol.id}`);
  }

  return (
    <div className="stack page-collection" ref={pageRef}>
      <header className="page-head">
        <h1 className="page-title">{t("collection.title")}</h1>
        <p className="lede">{t("collection.lede")}</p>
      </header>

      {loading ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading ? (
        <section className="volumes-section">
          {volumes.length === 0 ? (
            <p className="muted">{t("collection.volumesEmpty")}</p>
          ) : (
            <div className="volume-rail">
              {volumes.map((vol) => (
                <button
                  key={vol.id}
                  type="button"
                  className={`volume-tile${sourceId === vol.id ? " is-open-source" : ""}`}
                  data-volume-id={vol.id}
                  aria-label={t("collection.volumeOpen")}
                  onPointerDown={(e) => {
                    const cover = e.currentTarget.querySelector(".volume-tile-cover");
                    if (cover instanceof HTMLElement) {
                      setVolumeOpenHandoff({
                        volumeId: vol.id,
                        coverUrl: volumeCoverUrl(vol.id),
                        box: measureBox(cover),
                        dir: "open",
                      });
                    }
                  }}
                  onClick={(e) => {
                    const cover = e.currentTarget.querySelector(".volume-tile-cover");
                    openVolume(vol, cover instanceof HTMLElement ? cover : null);
                  }}
                >
                  <div className="volume-tile-cover">
                    <img
                      className="volume-tile-art"
                      src={volumeCoverUrl(vol.id)}
                      alt=""
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = "none";
                        const fallback = el.nextElementSibling;
                        if (fallback instanceof HTMLElement) fallback.hidden = false;
                      }}
                    />
                    <div className="volume-tile-placeholder" hidden aria-hidden />
                    {vol.completed ? (
                      <img
                        className="volume-tile-seal"
                        src={volumeSealCompleteUrl()}
                        alt=""
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <strong>{msg(vol.titleKey)}</strong>
                  <span className="muted">
                    {vol.completed
                      ? t("collection.volumeDone")
                      : t("collection.volumeProgress", {
                          lit: vol.litCount,
                          total: vol.totalSlots,
                        })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading ? (
        <div className="me-menu">
          <Link className="me-row" to="/collection/species">
            <span>{t("collection.speciesTitle")}</span>
            <span className="me-row-side">
              <span className="muted">
                {t("collection.speciesCount", { count: entryCount })}
              </span>
              <span className="me-row-go" aria-hidden>
                ›
              </span>
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
