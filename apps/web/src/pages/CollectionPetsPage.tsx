import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useMatch, useNavigate } from "react-router-dom";
import { hasMessage, t, type MessageKey } from "@biotrace/messages";
import { api, type PetCollectionEntry, type Rarity } from "../api";
import { ListTag, ListTagRow } from "../components/ListTagRow";
import { useBackClose } from "../androidBack";
import {
  buildNamedFuse,
  filterNamed,
  indexNamed,
  speciesEntryName,
} from "../speciesSearch";
import { restoreContentScroll, saveContentScroll } from "../scrollMemory";

function entryName(entry: PetCollectionEntry) {
  return speciesEntryName(entry, t("detail.unnamed"));
}

function rarityLabel(r: Rarity) {
  const key = `rarity.${r}`;
  return hasMessage(key) ? t(key as MessageKey) : r;
}

export default function CollectionPetsPage() {
  const navigate = useNavigate();
  const cardOpen = Boolean(useMatch("/collection/pets/:id"));
  useBackClose(() => navigate("/collection"), !cardOpen);
  const [entries, setEntries] = useState<PetCollectionEntry[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRestored = useRef(false);

  useEffect(() => {
    api
      .listPetCollection()
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
      restoreContentScroll("collection-pets");
      scrollRestored.current = true;
    }
  }, [loading, cardOpen]);

  const indexed = useMemo(() => entries.map(indexNamed), [entries]);
  const fuse = useMemo(() => (indexed.length ? buildNamedFuse(indexed) : null), [indexed]);

  const visible = useMemo(() => {
    const byName = filterNamed(indexed, fuse, query);
    const copy = [...byName];
    if (sort === "recent") {
      copy.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    } else {
      copy.sort((a, b) => speciesEntryName(a).localeCompare(speciesEntryName(b), "zh"));
    }
    return copy;
  }, [indexed, fuse, query, sort]);

  return (
    <div
      className={`stack page-collection-species${cardOpen ? " is-covered" : ""}`}
      {...(cardOpen ? { inert: true } : {})}
    >
      <header className="page-head me-sub-head">
        <Link className="text-link" to="/collection">
          ← {t("collection.volumeBack")}
        </Link>
        <h1 className="page-title">{t("collection.petsTitle")}</h1>
      </header>

      {loading ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && entries.length === 0 ? (
        <p className="muted">{t("collection.petsEmpty")}</p>
      ) : null}

      {!loading && entries.length > 0 ? (
        <>
          <div className="species-toolbar">
            <label className="sr-only" htmlFor="collection-pets-q">
              {t("collection.speciesSearch")}
            </label>
            <input
              id="collection-pets-q"
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("collection.speciesSearch")}
              autoComplete="off"
            />
            <div className="species-sort" role="group">
              <button
                type="button"
                className={`species-sort-btn${sort === "recent" ? " is-on" : ""}`}
                aria-pressed={sort === "recent"}
                onClick={() => setSort("recent")}
              >
                {t("collection.speciesSortRecent")}
              </button>
              <button
                type="button"
                className={`species-sort-btn${sort === "name" ? " is-on" : ""}`}
                aria-pressed={sort === "name"}
                onClick={() => setSort("name")}
              >
                {t("collection.speciesSortName")}
              </button>
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
                  to={`/collection/pets/${entry.id}`}
                  onClick={() => saveContentScroll("collection-pets")}
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
                      {entry.rarity ? (
                        <span className={`rarity-badge rarity-${entry.rarity}`}>
                          {rarityLabel(entry.rarity)}
                        </span>
                      ) : null}
                      <ListTag tag="domesticated" />
                    </span>
                    <ListTagRow tags={entry.tags} except={["domesticated"]} />
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
