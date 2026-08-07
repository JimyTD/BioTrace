import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { t, type MessageKey } from "@biotrace/messages";
import { api, type CollectionEntry, type Rarity, type VolumeListItem } from "../api";

function rarityLabel(r: Rarity) {
  return t(`rarity.${r}` as MessageKey);
}

function msg(key: string) {
  return t(key as MessageKey);
}

export default function CollectionPage() {
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [volumes, setVolumes] = useState<VolumeListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listCollection(), api.listVolumes()])
      .then(([col, vol]) => {
        setEntries(col.entries);
        setVolumes(vol.volumes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="stack">
      <div>
        <h1 className="brand">{t("collection.title")}</h1>
        <p className="lede">{t("collection.lede")}</p>
      </div>

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
            <div className="volume-grid">
              {volumes.map((vol) => (
                <article
                  key={vol.id}
                  className={`volume-card${vol.completed ? " volume-card-lit" : " volume-card-dim"}`}
                >
                  <div className="volume-card-head">
                    <strong>{msg(vol.titleKey)}</strong>
                    <span className="muted">
                      {vol.completed
                        ? t("collection.volumeDone")
                        : t("collection.volumeProgress", {
                            lit: vol.litCount,
                            total: vol.totalSlots,
                          })}
                    </span>
                  </div>
                  <p className="muted volume-lede">{msg(vol.ledeKey)}</p>
                  <ul className="volume-slots">
                    {vol.slots.map((slot) => (
                      <li key={slot.id} className={slot.lit ? "slot-lit" : "slot-dim"}>
                        {msg(slot.titleKey)}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading && entries.length === 0 ? (
        <div className="panel">
          <p className="muted">{t("collection.empty")}</p>
        </div>
      ) : (
        <div className="album">
          {entries.map((entry) => (
            <Link
              className="card card-link"
              key={entry.id}
              to={
                entry.coverObservationId
                  ? `/observations/${entry.coverObservationId}`
                  : "/collection"
              }
            >
              {entry.coverDisplayUrl ? (
                <img
                  src={entry.coverDisplayUrl}
                  alt={entry.commonName || entry.scientificName || entry.taxonKey}
                />
              ) : (
                <div className="card-placeholder" />
              )}
              <div className="meta">
                <span className={`rarity-badge rarity-${entry.rarity}`}>
                  {rarityLabel(entry.rarity)}
                </span>
                <strong>
                  {entry.commonName || entry.scientificName || entry.taxonKey || t("detail.unnamed")}
                </strong>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
