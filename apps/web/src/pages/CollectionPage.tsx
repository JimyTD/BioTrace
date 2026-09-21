import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api, type CollectionEntry, type PetCollectionEntry } from "../api";
import { pickCollectionFaces } from "../collectionFaces";
import { MeRowIcon } from "../components/MeRowIcon";
import { collectionTreeDoorUrl } from "../themes";
import { peekCollection, rememberCollection } from "../pageCache";
import { countTreeKingdoms } from "../treeBuild";
import { restoreContentScroll, saveContentScroll } from "../scrollMemory";

export default function CollectionPage() {
  const cached = peekCollection();
  const [entryCount, setEntryCount] = useState(() => cached?.entryCount ?? 0);
  const [petCount, setPetCount] = useState(() => cached?.petCount ?? 0);
  const [kingdomCount, setKingdomCount] = useState(() => cached?.kingdomCount ?? 0);
  const [entries, setEntries] = useState<CollectionEntry[]>(() => cached?.entries ?? []);
  const [petEntries, setPetEntries] = useState<PetCollectionEntry[]>(() => cached?.petEntries ?? []);
  const [petFaces, setPetFaces] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !cached);

  useEffect(() => {
    restoreContentScroll("collection");
    Promise.all([
      api.listCollection(),
      api.listPetCollection().catch(() => ({ entries: [] as PetCollectionEntry[] })),
    ])
      .then(([collection, pets]) => {
        const all = [...collection.entries, ...pets.entries];
        const count = all.length;
        const kingdoms = countTreeKingdoms(all);
        setEntryCount(count);
        setPetCount(pets.entries.length);
        setKingdomCount(kingdoms);
        setEntries(collection.entries);
        setPetEntries(pets.entries);
        setPetFaces(
          pets.entries
            .map((entry) => entry.coverDisplayUrl)
            .filter((url): url is string => Boolean(url))
            .slice(0, 4),
        );
        rememberCollection({
          entryCount: count,
          petCount: pets.entries.length,
          kingdomCount: kingdoms,
          entries: collection.entries,
          petEntries: pets.entries,
        });
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : t("collection.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  const faces = useMemo(() => pickCollectionFaces([...entries, ...petEntries]), [entries, petEntries]);
  const treeDoorUrl = collectionTreeDoorUrl();

  return (
    <div className="stack page-collection">
      <header className="page-head">
        <h1 className="page-title">{t("collection.title")}</h1>
        <p className="lede">{t("collection.lede")}</p>
      </header>

      {loading ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading || entries.length > 0 || petEntries.length > 0 ? (
        <div className="me-menu">
          <Link className="me-row" to="/collection/species" onClick={() => saveContentScroll("collection")}>
            <MeRowIcon name="species" />
            <span>{t("collection.speciesTitle")}</span>
            <span className="me-row-side">
              <span className="muted">{t("collection.speciesCount", { count: entryCount })}</span>
              <span className="me-row-go">›</span>
            </span>
            <div className="collection-faces">
              {faces.map((entry) => (
                <img key={entry.id} src={entry.coverDisplayUrl ?? ""} alt="" loading="lazy" />
              ))}
            </div>
          </Link>
          <Link className="me-row" to="/collection/pets" onClick={() => saveContentScroll("collection")}>
            <MeRowIcon name="pets" />
            <span>{t("collection.petsTitle")}</span>
            <span className="me-row-side">
              <span className="muted">{t("collection.speciesCount", { count: petCount })}</span>
              <span className="me-row-go">›</span>
            </span>
            <div className="collection-faces">
              {petFaces.map((url, index) => (
                <img key={`${index}-${url}`} src={url} alt="" loading="lazy" />
              ))}
            </div>
          </Link>
          <Link className="me-row" to="/collection/tree" onClick={() => saveContentScroll("collection")}>
            <MeRowIcon name="tree" />
            <span>{t("collection.treeTitle")}</span>
            <span className="me-row-side">
              <span className="muted">{t("collection.treeCount", { count: kingdomCount })}</span>
              <span className="me-row-go">›</span>
            </span>
            <div className="collection-tree-door">
              {treeDoorUrl ? <img src={treeDoorUrl} alt="" loading="lazy" /> : null}
            </div>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
