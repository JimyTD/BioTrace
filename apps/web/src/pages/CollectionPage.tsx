import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { hasMessage, t, type MessageKey } from "@biotrace/messages";
import { api, type CollectionEntry, type Rarity, type VolumeListItem } from "../api";
import VolumeBookDialog from "../components/VolumeBookDialog";
import { volumeCoverUrl, volumeSealCompleteUrl } from "../themes";

function rarityLabel(r: Rarity) {
  return t(`rarity.${r}` as MessageKey);
}

function msg(key: string) {
  return hasMessage(key) ? t(key) : key;
}

export default function CollectionPage() {
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [volumes, setVolumes] = useState<VolumeListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openVolumeId, setOpenVolumeId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listCollection(), api.listVolumes()])
      .then(([col, vol]) => {
        setEntries(col.entries);
        setVolumes(vol.volumes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  const openVolume = volumes.find((v) => v.id === openVolumeId) ?? null;

  return (
    <div className="stack page-collection">
      <header className="page-head">
        <h1 className="page-title">{t("collection.title")}</h1>
        <p className="lede">{t("collection.lede")}</p>
      </header>

      {loading ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading ? (
        <section className="stack volumes-section">
          <div>
            <h2 className="section-title">{t("collection.volumesTitle")}</h2>
            <p className="muted">{t("collection.volumesLede")}</p>
          </div>
          {volumes.length === 0 ? (
            <p className="muted">{t("collection.volumesEmpty")}</p>
          ) : (
            <div className="volume-rail">
              {volumes.map((vol) => (
                <button
                  key={vol.id}
                  type="button"
                  className={`volume-tile${vol.completed ? " is-complete" : ""}`}
                  onClick={() => setOpenVolumeId(vol.id)}
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
                    <span className="volume-tile-progress">
                      {vol.completed
                        ? t("collection.volumeDone")
                        : t("collection.volumeProgress", {
                            lit: vol.litCount,
                            total: vol.totalSlots,
                          })}
                    </span>
                  </div>
                  <strong>{msg(vol.titleKey)}</strong>
                  <span className="muted volume-tile-open">{t("collection.volumeOpen")}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading ? (
        <section className="stack">
          <h2 className="section-title">{t("collection.speciesTitle")}</h2>
          {entries.length === 0 ? (
            <p className="muted empty-hint">{t("collection.empty")}</p>
          ) : (
            <div className="album film-grid">
              {entries.map((entry) => (
                <Link
                  className="film-tile-link"
                  key={entry.id}
                  to={
                    entry.coverObservationId
                      ? `/observations/${entry.coverObservationId}`
                      : "/collection"
                  }
                >
                  <div className="film-tile-media">
                    {entry.coverDisplayUrl ? (
                      <img
                        src={entry.coverDisplayUrl}
                        alt={entry.commonName || entry.scientificName || entry.taxonKey}
                      />
                    ) : (
                      <div className="card-placeholder" />
                    )}
                  </div>
                  <div className="film-tile-meta">
                    <div className="card-tags">
                      <span className={`rarity-badge rarity-${entry.rarity}`}>
                        {rarityLabel(entry.rarity)}
                      </span>
                      {entry.alertIntroduced ? (
                        <span className="intro-tag">{t("settle.alertIntroduced")}</span>
                      ) : null}
                    </div>
                    <strong>
                      {entry.commonName ||
                        entry.scientificName ||
                        entry.taxonKey ||
                        t("detail.unnamed")}
                    </strong>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <VolumeBookDialog volume={openVolume} onClose={() => setOpenVolumeId(null)} />
    </div>
  );
}
