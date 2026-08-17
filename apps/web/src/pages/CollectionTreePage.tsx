import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { hasMessage, t, type MessageKey } from "@biotrace/messages";
import { api, type CollectionEntry, type Rarity } from "../api";
import { measureBox } from "../motion";
import { playPhotoLift } from "../photoLift";
import { peekCollection, rememberCollection } from "../pageCache";
import {
  buildTreeLayer,
  countTreeClasses,
  folderIsUnaryGenus,
  parseTreePath,
  treePathUrl,
  unaryGenusEntry,
  UNPLACED_LATIN,
  type TreeFolder,
  type TreeLayer,
} from "../treeBuild";
import { speciesEntryName } from "../speciesSearch";
import {
  clearTreeOpenHandoff,
  peekTreeOpenHandoff,
  setTreeOpenHandoff,
} from "../treeOpenHandoff";

function rarityLabel(r: Rarity) {
  const key = `rarity.${r}`;
  return hasMessage(key) ? t(key as MessageKey) : r;
}

function folderName(folder: TreeFolder) {
  if (folder.rank === "unplaced") return t("collection.treeUnplaced");
  return folder.name;
}

function layerTitle(layer: TreeLayer, path: string[]) {
  if (path[0] === UNPLACED_LATIN) return t("collection.treeUnplaced");
  if (path.length === 0) return t("collection.treeTitle");
  return layer.title;
}

function layerLede(layer: TreeLayer, path: string[]) {
  if (path.length === 0) return t("collection.treeLede");
  return layer.lede;
}

export default function CollectionTreePage() {
  const splat = useParams()["*"];
  const path = useMemo(() => parseTreePath(splat), [splat]);
  const navigate = useNavigate();
  const location = useLocation();
  const cached = peekCollection()?.entries;
  const [entries, setEntries] = useState<CollectionEntry[]>(() => cached ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !cached);
  const [sourceLatin, setSourceLatin] = useState<string | null>(null);
  const [, setLanded] = useState(0);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const openPlayed = useRef(false);
  const returnPlayed = useRef(false);

  useEffect(() => {
    api
      .listCollection()
      .then((col) => {
        setEntries(col.entries);
        const prev = peekCollection();
        rememberCollection({
          entryCount: col.entries.length,
          classCount: countTreeClasses(col.entries),
          entries: col.entries,
          volumes: prev?.volumes ?? [],
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  const layer = useMemo(() => buildTreeLayer(entries, path), [entries, path]);
  const pendingOpen = peekTreeOpenHandoff();
  const hideDestCover = Boolean(
    pendingOpen &&
      pendingOpen.dir === "open" &&
      treePathUrl(pendingOpen.destPath) === location.pathname &&
      pendingOpen.coverUrl,
  );

  useLayoutEffect(() => {
    openPlayed.current = false;
    returnPlayed.current = false;
  }, [splat]);

  useLayoutEffect(() => {
    if (loading || openPlayed.current) return;
    const found = peekTreeOpenHandoff();
    if (!found || found.dir !== "open") return;
    if (treePathUrl(found.destPath) !== location.pathname) return;
    const cover = coverRef.current;
    const page = pageRef.current;
    if (!cover || !page || !found.coverUrl) {
      clearTreeOpenHandoff();
      return;
    }
    openPlayed.current = true;
    let cancelled = false;
    void playPhotoLift({
      photoUrl: found.coverUrl,
      from: found.box,
      to: () => measureBox(cover),
      page,
      hide: cover,
      duration: 420,
      cancelled: () => cancelled,
      onLanded: () => {
        clearTreeOpenHandoff();
        if (!cancelled) flushSync(() => setLanded((n) => n + 1));
      },
    });
    return () => {
      cancelled = true;
    };
  }, [loading, layer, location.pathname]);

  useLayoutEffect(() => {
    if (loading || returnPlayed.current) return;
    const found = peekTreeOpenHandoff();
    if (!found || found.dir !== "close") return;
    if (treePathUrl(found.destPath) !== location.pathname) return;
    const plate = document.querySelector<HTMLElement>(
      `.tree-plate[data-latin="${CSS.escape(found.plateLatin)}"] .tree-plate-art`,
    );
    const page = pageRef.current;
    if (!plate || !page || !found.coverUrl) {
      clearTreeOpenHandoff();
      return;
    }
    returnPlayed.current = true;
    setSourceLatin(found.plateLatin);
    let cancelled = false;
    void playPhotoLift({
      photoUrl: found.coverUrl,
      from: found.box,
      to: () => measureBox(plate),
      page,
      hide: plate,
      duration: 380,
      pageFade: "none",
      cancelled: () => cancelled,
      onLanded: () => {
        clearTreeOpenHandoff();
        if (!cancelled) flushSync(() => setSourceLatin(null));
      },
    });
    return () => {
      cancelled = true;
    };
  }, [loading, layer, location.pathname]);

  function openFolder(folder: TreeFolder, art: HTMLElement | null) {
    if (folderIsUnaryGenus(folder, entries, path)) {
      const entry = unaryGenusEntry(folder, entries, path);
      if (entry) {
        navigate(`/collection/species/${entry.id}`, { state: { from: location.pathname } });
        return;
      }
    }
    const destPath = [...path, folder.latin];
    if (art && folder.coverUrl) {
      setTreeOpenHandoff({
        destPath,
        plateLatin: folder.latin,
        coverUrl: folder.coverUrl,
        box: measureBox(art),
        dir: "open",
      });
    }
    navigate(treePathUrl(destPath));
  }

  function goBack() {
    if (path.length === 0) {
      navigate("/collection");
      return;
    }
    const destPath = path.slice(0, -1);
    const cover = coverRef.current;
    if (cover && layer.coverUrl) {
      setTreeOpenHandoff({
        destPath,
        plateLatin: path[path.length - 1] ?? "",
        coverUrl: layer.coverUrl,
        box: measureBox(cover),
        dir: "close",
      });
    }
    navigate(treePathUrl(destPath));
  }

  const parentTitle =
    path.length > 1
      ? layerTitle(buildTreeLayer(entries, path.slice(0, -1)), path.slice(0, -1))
      : "";
  const backLabel =
    path.length === 0
      ? t("collection.volumeBack")
      : path.length === 1
        ? t("collection.treeTitle")
        : parentTitle || t("collection.treeTitle");

  const title = layerTitle(layer, path);
  const lede = layerLede(layer, path);
  const showCover = Boolean(layer.coverUrl && path.length > 0);

  return (
    <div className="stack page-collection-tree" ref={pageRef}>
      <header className="page-head me-sub-head tree-head">
        <button className="text-link" type="button" onClick={goBack}>
          ← {backLabel}
        </button>
        <div className={`tree-head-row${showCover ? " has-cover" : ""}`}>
          <div
            className={`tree-head-cover${hideDestCover ? " is-open-dest" : ""}`}
            ref={coverRef}
          >
            {showCover ? <img src={layer.coverUrl ?? ""} alt="" /> : null}
          </div>
          <div>
            <h1 className="page-title">{title}</h1>
            {lede ? <p className="lede">{lede}</p> : null}
          </div>
        </div>
      </header>

      {loading ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && entries.length === 0 ? (
        <p className="muted">{t("collection.empty")}</p>
      ) : null}

      {!loading && layer.items.length > 0 ? (
        <div className={`tree-deck${layer.split ? " is-split" : ""}`}>
          {layer.items.map((item) => {
            if (item.kind === "folder") {
              const name = folderName(item);
              const skipLift = folderIsUnaryGenus(item, entries, path);
              return (
                <button
                  key={`f-${item.latin}`}
                  type="button"
                  className={`tree-plate${sourceLatin === item.latin ? " is-source" : ""}`}
                  data-latin={item.latin}
                  onPointerDown={(e) => {
                    if (skipLift || !item.coverUrl) return;
                    const art = e.currentTarget.querySelector(".tree-plate-art");
                    if (art instanceof HTMLElement) {
                      setTreeOpenHandoff({
                        destPath: [...path, item.latin],
                        plateLatin: item.latin,
                        coverUrl: item.coverUrl,
                        box: measureBox(art),
                        dir: "open",
                      });
                    }
                  }}
                  onClick={(e) => {
                    const art = e.currentTarget.querySelector(".tree-plate-art");
                    openFolder(item, art instanceof HTMLElement ? art : null);
                  }}
                >
                  <div className="tree-plate-art">
                    {item.coverUrl ? <img src={item.coverUrl} alt="" /> : <span aria-hidden />}
                  </div>
                  <strong>{name}</strong>
                  <span className="muted">
                    {item.caption ? `${item.caption} · ` : ""}
                    {t("collection.speciesCount", { count: item.count })}
                  </span>
                </button>
              );
            }
            const entry = item.entry;
            return (
              <button
                key={`l-${entry.id}`}
                type="button"
                className="tree-tile"
                onClick={() =>
                  navigate(`/collection/species/${entry.id}`, { state: { from: location.pathname } })
                }
              >
                {entry.coverDisplayUrl ? (
                  <img className="tree-tile-photo" src={entry.coverDisplayUrl} alt="" />
                ) : (
                  <span className="tree-tile-photo is-empty" aria-hidden />
                )}
                <strong>{speciesEntryName(entry, t("detail.unnamed"))}</strong>
                {entry.scientificName && entry.commonName ? (
                  <span className="muted">{entry.scientificName}</span>
                ) : null}
                <span className={`rarity-badge rarity-${entry.rarity}`}>{rarityLabel(entry.rarity)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
