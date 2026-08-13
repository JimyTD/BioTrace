import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t, type MessageKey } from "@biotrace/messages";
import { api, type CollectionEntry, type Rarity } from "../api";

const IDLE_LIST_MAX = 24;

function rarityLabel(r: Rarity) {
  return t(`rarity.${r}` as MessageKey);
}

function entryName(entry: CollectionEntry) {
  return entry.commonName || entry.scientificName || entry.taxonKey || t("detail.unnamed");
}

function matchesQuery(entry: CollectionEntry, q: string) {
  const hay = [entry.commonName, entry.scientificName, entry.taxonKey]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export default function CollectionSpeciesPage() {
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listCollection()
      .then((col) => setEntries(col.entries))
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (q) return entries.filter((e) => matchesQuery(e, q));
    if (entries.length <= IDLE_LIST_MAX) return entries;
    return [];
  }, [entries, q]);

  const idleSearch = !q && entries.length > IDLE_LIST_MAX;

  return (
    <div className="stack page-collection-species">
      <header className="page-head me-sub-head">
        <Link className="text-link" to="/collection">
          ← {t("collection.volumeBack")}
        </Link>
        <h1 className="page-title">{t("collection.speciesTitle")}</h1>
      </header>

      {loading ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && entries.length === 0 ? (
        <p className="muted">{t("collection.empty")}</p>
      ) : null}

      {!loading && entries.length > 0 ? (
        <>
          <label className="sr-only" htmlFor="collection-species-q">
            {t("collection.speciesSearch")}
          </label>
          <input
            id="collection-species-q"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("collection.speciesSearch")}
            autoComplete="off"
          />
          {idleSearch ? (
            <p className="muted">{t("collection.speciesIdle", { count: entries.length })}</p>
          ) : null}
          {!idleSearch && q && visible.length === 0 ? (
            <p className="muted">{t("collection.speciesNoMatch")}</p>
          ) : null}
          {visible.length > 0 ? (
            <div className="species-index">
              {visible.map((entry) => (
                <Link
                  key={entry.id}
                  className="species-index-row"
                  to={
                    entry.coverObservationId
                      ? `/observations/${entry.coverObservationId}`
                      : "/collection/species"
                  }
                >
                  {entry.coverDisplayUrl ? (
                    <img className="species-index-thumb" src={entry.coverDisplayUrl} alt="" />
                  ) : (
                    <span className="species-index-thumb is-empty" aria-hidden />
                  )}
                  <span className="species-index-copy">
                    <strong>{entryName(entry)}</strong>
                    <span className="muted">
                      {entry.scientificName && entry.commonName ? entry.scientificName : ""}
                      {entry.scientificName && entry.commonName ? " · " : ""}
                      {rarityLabel(entry.rarity)}
                      {entry.alertIntroduced ? ` · ${t("settle.alertIntroduced")}` : ""}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
