import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useMatch, useNavigate } from "react-router-dom";
import { useBackClose } from "../androidBack";
import { hasMessage, t, type MessageKey } from "@biotrace/messages";
import { api, type CollectionEntry, type Rarity } from "../api";
import {
  buildSpeciesFuse,
  filterSpecies,
  indexSpecies,
  raritiesInEntries,
  sortSpecies,
  speciesEntryName,
  type SpeciesSort,
} from "../speciesSearch";
import { restoreContentScroll, saveContentScroll } from "../scrollMemory";

function rarityLabel(r: Rarity) {
  const key = `rarity.${r}`;
  return hasMessage(key) ? t(key as MessageKey) : r;
}

function entryName(entry: CollectionEntry) {
  return speciesEntryName(entry, t("detail.unnamed"));
}

export default function CollectionSpeciesPage() {
  const navigate = useNavigate();
  const cardOpen = Boolean(useMatch("/collection/species/:id"));
  useBackClose(() => navigate("/collection"), !cardOpen);
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [query, setQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SpeciesSort>("recent");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRestored = useRef(false);

  useEffect(() => {
    api
      .listCollection()
      .then((col) => setEntries(col.entries))
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  useLayoutEffect(() => {
    if (cardOpen) {
      scrollRestored.current = false;
      return;
    }
    if (loading) return;
    if (!scrollRestored.current) {
      restoreContentScroll("collection-species");
      scrollRestored.current = true;
    }
  }, [loading, cardOpen]);

  const indexed = useMemo(() => entries.map(indexSpecies), [entries]);
  const fuse = useMemo(() => (indexed.length ? buildSpeciesFuse(indexed) : null), [indexed]);
  const rarityChips = useMemo(() => raritiesInEntries(entries), [entries]);

  const visible = useMemo(() => {
    const byName = filterSpecies(indexed, fuse, query);
    const byRarity = rarityFilter ? byName.filter((e) => e.rarity === rarityFilter) : byName;
    return sortSpecies(byRarity, sort);
  }, [indexed, fuse, query, rarityFilter, sort]);

  const sorts: { id: SpeciesSort; label: string }[] = [
    { id: "recent", label: t("collection.speciesSortRecent") },
    { id: "rarity", label: t("collection.speciesSortRarity") },
    { id: "name", label: t("collection.speciesSortName") },
  ];

  return (
    <div
      className={`stack page-collection-species${cardOpen ? " is-covered" : ""}`}
      {...(cardOpen ? { inert: true } : {})}
    >
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
          <div className="species-toolbar">
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
            {rarityChips.length > 1 ? (
              <div className="species-chips" role="group" aria-label={t("collection.speciesSortRarity")}>
                <button
                  type="button"
                  className={`species-chip${rarityFilter === null ? " is-on" : ""}`}
                  aria-pressed={rarityFilter === null}
                  onClick={() => setRarityFilter(null)}
                >
                  {t("collection.speciesFilterAll")}
                </button>
                {rarityChips.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`species-chip${rarityFilter === r ? " is-on" : ""}`}
                    aria-label={rarityLabel(r)}
                    aria-pressed={rarityFilter === r}
                    onClick={() => setRarityFilter(rarityFilter === r ? null : r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="species-sort" role="group">
              {sorts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`species-sort-btn${sort === item.id ? " is-on" : ""}`}
                  aria-pressed={sort === item.id}
                  onClick={() => setSort(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {visible.length === 0 ? (
            <p className="muted">{t("collection.speciesNoMatch")}</p>
          ) : (
            <div className="species-index">
              {visible.map((entry) => (
                <Link
                  key={entry.id}
                  className="species-index-row"
                  to={`/collection/species/${entry.id}`}
                  onClick={() => saveContentScroll("collection-species")}
                >
                  {entry.coverDisplayUrl ? (
                    <img className="species-index-thumb" src={entry.coverDisplayUrl} alt="" />
                  ) : (
                    <span className="species-index-thumb is-empty" aria-hidden />
                  )}
                  <span className="species-index-copy">
                    <strong>{entryName(entry)}</strong>
                    {entry.scientificName && entry.commonName ? (
                      <span className="muted species-index-sci">{entry.scientificName}</span>
                    ) : null}
                    <span className="species-index-marks">
                      <span className={`rarity-badge rarity-${entry.rarity}`}>
                        {rarityLabel(entry.rarity)}
                      </span>
                      {entry.alertIntroduced ? (
                        <span className="muted">{t("settle.alertIntroduced")}</span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
