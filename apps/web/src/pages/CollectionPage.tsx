import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api } from "../api";
import { MeRowIcon } from "../components/MeRowIcon";
import { collectionTreeDoorUrl } from "../themes";
import { peekCollection, rememberCollection } from "../pageCache";
import { countTreeKingdoms } from "../treeBuild";
import { restoreContentScroll, saveContentScroll } from "../scrollMemory";
import { petToIndexRow, sortSpecies, wildToIndexRow } from "../speciesSearch";
import { CollectionReel } from "../components/CollectionReel";
import { CollectionReelCard } from "../components/CollectionReelCard";
import { collectionReelStorageKey } from "../collectionReel";

export default function CollectionPage({ userId }: { userId: string }) {
  const [snapshot, setSnapshot] = useState(() => peekCollection(userId));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !snapshot);
  const [attempt, setAttempt] = useState(0);
  const scrollKey = `collection:${userId}`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([api.listCollection(), api.listPetCollection()])
      .then(([collection, pets]) => {
        if (!active) return;
        const all = [...collection.entries, ...pets.entries];
        const next = {
          entryCount: all.length,
          petCount: pets.entries.length,
          kingdomCount: countTreeKingdoms(all),
          entries: collection.entries,
          petEntries: pets.entries,
        };
        setSnapshot(next);
        rememberCollection(userId, next);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t("collection.loadFailed")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, attempt]);

  useEffect(() => { if (snapshot) restoreContentScroll(scrollKey); }, [Boolean(snapshot), scrollKey]);
  const rows = useMemo(() => sortSpecies([
    ...(snapshot?.entries ?? []).map(wildToIndexRow),
    ...(snapshot?.petEntries ?? []).map(petToIndexRow),
  ], "recent"), [snapshot]);
  const treeDoorUrl = collectionTreeDoorUrl();
  const rememberScroll = () => saveContentScroll(scrollKey);

  return (
    <div className="page-collection" aria-busy={loading && !snapshot}>
      <header className="collection-heading">
        <div><h1 className="page-title">{t("collection.title")}</h1><p className="lede">{t("collection.lede")}</p></div>
        {snapshot ? <Link className="collection-total" to="/collection/species" onClick={rememberScroll}>
          <strong>{rows.length}</strong><span>{t("collection.speciesTitle")} <span aria-hidden="true">↗</span></span>
        </Link> : null}
      </header>

      {loading && !snapshot ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <div className="collection-load-error" role="alert"><p className="error">{error}</p><button type="button" className="btn secondary" onClick={() => setAttempt(value => value + 1)}>{t("collection.reload")}</button></div> : null}

      {snapshot ? <>
        <CollectionReel items={rows} storageKey={collectionReelStorageKey(userId)} onNavigate={rememberScroll} renderItem={(entry, index) => <CollectionReelCard entry={entry} index={index} onNavigate={rememberScroll} />} />
        <div className="collection-links">
          <Link className="collection-door" to="/collection/pets" onClick={rememberScroll}>
            <MeRowIcon name="pets" />
            <span className="collection-door-copy"><strong>{t("collection.petsTitle")}</strong><span>{t("collection.speciesCount", { count: snapshot.petEntries?.length ?? 0 })}</span></span>
            <span className="collection-door-arrow" aria-hidden="true">↗</span>
          </Link>
          <Link className="collection-door" to="/collection/tree" onClick={rememberScroll}>
            <span className="collection-tree-door" aria-hidden="true">{treeDoorUrl ? <img src={treeDoorUrl} alt="" width="720" height="800" /> : null}</span>
            <span className="collection-door-copy"><strong>{t("collection.treeTitle")}</strong><span>{t("collection.treeCount", { count: snapshot.kingdomCount ?? 0 })}</span></span>
            <span className="collection-door-arrow" aria-hidden="true">↗</span>
          </Link>
        </div>
      </> : null}
    </div>
  );
}
