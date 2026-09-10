import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useMatch, useNavigate } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api, type PetCollectionEntry } from "../api";
import { useBackClose } from "../androidBack";
import { speciesEntryName } from "../speciesSearch";
import { restoreContentScroll, saveContentScroll } from "../scrollMemory";

function entryName(entry: PetCollectionEntry) {
  return speciesEntryName(entry, t("detail.unnamed"));
}

function sheetClass(n: number) {
  const k = Math.min(Math.max(n, 1), 6);
  return `pet-plate-sheet is-${k}`;
}

export default function CollectionPetsPage() {
  const navigate = useNavigate();
  const cardOpen = Boolean(useMatch("/collection/pets/:id"));
  useBackClose(() => navigate("/collection"), !cardOpen);
  const [entries, setEntries] = useState<PetCollectionEntry[]>([]);
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

  return (
    <div
      className={`stack page-collection-pets${cardOpen ? " is-covered" : ""}`}
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
        <div className="pet-plates">
          {entries.map((entry) => {
            const name = entryName(entry);
            const faces = (
              entry.faces && entry.faces.length > 0
                ? entry.faces
                : entry.coverDisplayUrl
                  ? [entry.coverDisplayUrl]
                  : []
            ).slice(0, 6);
            const count = Math.max(entry.sightingCount ?? 0, faces.length);
            return (
              <Link
                key={entry.id}
                className="pet-plate"
                to={`/collection/pets/${entry.id}`}
                onClick={() => saveContentScroll("collection-pets")}
                aria-label={`${name}，${t("collection.petsSightingCount", { count })}`}
              >
                <span className="pet-plate-mount" aria-hidden />
                <span className={sheetClass(faces.length)}>
                  {faces.length > 0 ? (
                    faces.map((url) => <img key={url} src={url} alt="" />)
                  ) : (
                    <span className="pet-plate-empty" aria-hidden />
                  )}
                </span>
                <strong className="pet-plate-name">{name}</strong>
                <span className="pet-plate-count">
                  {t("collection.petsSightingCount", { count })}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
