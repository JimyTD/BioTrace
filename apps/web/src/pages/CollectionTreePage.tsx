/**
 * 物种树页面。整页就是一棵 3D 树。
 *
 * ── URL 设计：单节点 id，不是路径链 ────────────────────────
 *   /collection/tree              全树
 *   /collection/tree/2%3AAves     聚焦鸟纲
 *
 * 旧实现用拉丁名链（/tree/Animalia/Chordata/Aves）。改成单 id 的理由：
 *   · 3D 树的展开只需要知道焦点，父链能从数据推出来（chainOf）
 *   · 骨架里拉丁名会重复（单型分类单元，纲与目同名），链式路径无法消歧
 *   · 链会很长，而 3D 树本来就靠场景本身表达"我在哪"
 *
 * ── 为什么场景不会因导航而重建 ─────────────────────────────
 * 焦点变化只改 URL 参数，SpeciesTree3D 不卸载 → WebGL 上下文保住，
 * 展开动画是连续的 morph。于是深链、返回键、前进后退全都免费拿到。
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api, type CollectionEntry, type PetCollectionEntry } from "../api";
import { useBackClose } from "../androidBack";
import { peekCollection, rememberCollection } from "../pageCache";
import { countTreeKingdoms } from "../treeBuild";
import SpeciesTree3D from "../components/SpeciesTree3D";
import { toTreeCollectible, type TreeCollectible } from "../tree/treeModel";

function sameTreeIds(a: TreeCollectible[], b: TreeCollectible[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id || a[i]!.track !== b[i]!.track) return false;
  }
  return true;
}

function mergeTreeEntries(wild: CollectionEntry[], pets: PetCollectionEntry[]): TreeCollectible[] {
  return [...wild.map((e) => toTreeCollectible(e, "wild")), ...pets.map((e) => toTreeCollectible(e, "pet"))];
}

export default function CollectionTreePage() {
  const splat = useParams()["*"];
  const focusId = useMemo(() => {
    const raw = (splat ?? "").split("/").filter(Boolean)[0];
    return raw ? decodeURIComponent(raw) : null;
  }, [splat]);
  const navigate = useNavigate();
  const location = useLocation();
  const cached = peekCollection();
  const [entries, setEntries] = useState<TreeCollectible[]>(() =>
    mergeTreeEntries(cached?.entries ?? [], cached?.petEntries ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !cached?.entries);

  useEffect(() => {
    Promise.all([
      api.listCollection(),
      api.listPetCollection().catch(() => ({ entries: [] as PetCollectionEntry[] })),
    ])
      .then(([col, pets]) => {
        const next = mergeTreeEntries(col.entries, pets.entries);
        setEntries((prev) => (sameTreeIds(prev, next) ? prev : next));
        const prev = peekCollection();
        rememberCollection({
          entryCount: col.entries.length + pets.entries.length,
          petCount: pets.entries.length,
          kingdomCount: countTreeKingdoms([...col.entries, ...pets.entries]),
          entries: col.entries,
          petEntries: pets.entries,
          volumes: prev?.volumes ?? [],
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  // 安卓返回键：树里有层级时先退一级，到全树才离开页面
  useBackClose(() => {
    if (focusId) navigate("/collection/tree", { replace: true });
    else navigate("/collection");
  });

  return (
    <div className="page-tree3d">
      {loading && entries.length === 0 ? (
        <div className="tree3d-boot">{t("tree3d.growing")}</div>
      ) : (
        <SpeciesTree3D
          entries={entries}
          focusId={focusId}
          onFocusChange={(id) => {
            const next = id ? `/collection/tree/${encodeURIComponent(id)}` : "/collection/tree";
            if (next !== location.pathname) navigate(next, { replace: true });
          }}
          onOpenEntry={(e) => {
            const path =
              e.track === "pet" ? `/collection/pets/${e.id}` : `/collection/species/${e.id}`;
            navigate(path, { state: { from: location.pathname } });
          }}
          onLeave={() => navigate("/collection")}
        />
      )}
      {error ? <div className="tree3d-err">{error}</div> : null}
    </div>
  );
}
