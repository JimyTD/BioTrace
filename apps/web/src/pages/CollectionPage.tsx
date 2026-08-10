import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { t, type MessageKey } from "@biotrace/messages";
import { api, type CollectionEntry, type Rarity } from "../api";

function rarityLabel(r: Rarity) {
  return t(`rarity.${r}` as MessageKey);
}

export default function CollectionPage() {
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listCollection()
      .then((r) => setEntries(r.entries))
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
