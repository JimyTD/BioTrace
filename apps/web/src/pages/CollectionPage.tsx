import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { hasMessage, t } from "@biotrace/messages";
import { api, type VolumeListItem } from "../api";
import { volumeCoverUrl, volumeSealCompleteUrl } from "../themes";

function msg(key: string) {
  return hasMessage(key) ? t(key) : key;
}

export default function CollectionPage() {
  const [entryCount, setEntryCount] = useState(0);
  const [volumes, setVolumes] = useState<VolumeListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listCollection(), api.listVolumes()])
      .then(([col, vol]) => {
        setEntryCount(col.entries.length);
        setVolumes(vol.volumes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="stack page-collection">
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
                <Link
                  key={vol.id}
                  className="volume-tile"
                  to={`/collection/volumes/${vol.id}`}
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
                </Link>
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
