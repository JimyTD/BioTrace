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
import { api, type CollectionEntry } from "../api";
import { useBackClose } from "../androidBack";
import { peekCollection, rememberCollection } from "../pageCache";
import { countTreeKingdoms } from "../treeBuild";
import SpeciesTree3D from "../components/SpeciesTree3D";

export default function CollectionTreePage() {
  const splat = useParams()["*"];
  const focusId = useMemo(() => {
    const raw = (splat ?? "").split("/").filter(Boolean)[0];
    return raw ? decodeURIComponent(raw) : null;
  }, [splat]);
  const navigate = useNavigate();
  const location = useLocation();
  const cached = peekCollection()?.entries;
  const [entries, setEntries] = useState<CollectionEntry[]>(() => cached ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !cached);

  useEffect(() => {
    api
      .listCollection()
      .then((col) => {
        setEntries(col.entries);
        const prev = peekCollection();
        rememberCollection({
          entryCount: col.entries.length,
          kingdomCount: countTreeKingdoms(col.entries),
          entries: col.entries,
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
        <div className="tree3d-boot">正在生长这棵树…</div>
      ) : (
        <SpeciesTree3D
          entries={entries}
          focusId={focusId}
          onFocusChange={(id) => {
            const next = id ? `/collection/tree/${encodeURIComponent(id)}` : "/collection/tree";
            if (next !== location.pathname) navigate(next, { replace: true });
          }}
          onOpenEntry={(e) =>
            navigate(`/collection/species/${e.id}`, { state: { from: location.pathname } })
          }
        />
      )}
      {error ? <div className="tree3d-err">{error}</div> : null}
    </div>
  );
}
