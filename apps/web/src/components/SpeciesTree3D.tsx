/**
 * 3D 物种树的 React 宿主。
 *
 * 职责边界：
 *   TreeScene（imperative）  canvas + 标签层 + 每帧更新
 *   这个组件（React）        概要卡、详情视图、面包屑、URL 同步
 *
 * 为什么标签不用 React 渲染：它们每帧都要改 left/top，
 * 走 React 会每帧触发 reconcile。TreeScene 直接操作 DOM 池。
 * 概要卡则用 React —— 它不是每帧更新的。
 */
import { formatRank, t } from "@biotrace/messages";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CollectionEntry } from "../api";
import { TreeScene } from "../tree/TreeScene";
import {
  type SpeciesTree,
  type TreeNode,
  RANKS,
  buildSpeciesTree,
  chainOf,
  collectEntries,
  labelOf,
} from "../tree/treeModel";
import { kingdomHex, kvis } from "../tree/geom";
import "./SpeciesTree3D.css";

function rankName(lvl: number) {
  const key = RANKS[lvl];
  return key ? formatRank(key) : "";
}

export type SpeciesTree3DProps = {
  entries: CollectionEntry[];
  /** URL 里的节点 id（null = 全树） */
  focusId: string | null;
  onFocusChange: (id: string | null) => void;
  onOpenEntry: (entry: CollectionEntry) => void;
};

export default function SpeciesTree3D({
  entries,
  focusId,
  onFocusChange,
  onOpenEntry,
}: SpeciesTree3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<TreeScene | null>(null);
  const [tree, setTree] = useState<SpeciesTree | null>(null);
  const [card, setCard] = useState<TreeNode | null>(null);
  const [listOf, setListOf] = useState<TreeNode | null>(null);
  const [focus, setFocus] = useState<TreeNode | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 回调放进 ref：TreeScene 只在挂载时构造一次，不该因回调变化而重建
  const cb = useRef({ onFocusChange, onOpenEntry });
  cb.current = { onFocusChange, onOpenEntry };

  const built = useMemo(() => {
    try {
      return buildSpeciesTree(entries);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("tree3d.buildFailed"));
      return null;
    }
  }, [entries]);

  useEffect(() => {
    if (built) setTree(built);
  }, [built]);

  // ── 场景生命周期 ──
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !built) return;
    let scene: TreeScene | null = null;
    try {
      scene = new TreeScene(host, built.root, {
        onPick: (node, canExpand) => {
          setCard(node);
          setListOf(null);
          if (canExpand) {
            scene?.goTo(node);
            cb.current.onFocusChange(node === built.root ? null : node.id);
          }
        },
        onBlank: () => {
          // 点空白：先收卡，再退级 —— 层层退出，不会一下跳两步
          setCard((c) => {
            if (c) return null;
            const f = scene?.getFocus();
            if (f && f !== built.root) {
              const p = f.parent ?? built.root;
              scene?.goTo(p);
              cb.current.onFocusChange(p === built.root ? null : p.id);
            }
            return null;
          });
        },
        onFocus: (node) => setFocus(node),
      });
      sceneRef.current = scene;
      setFocus(built.root);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("tree3d.webglFailed"));
    }
    return () => {
      scene?.destroy();
      sceneRef.current = null;
    };
  }, [built]);

  // ── URL → 焦点 ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !tree) return;
    const target = focusId ? tree.byId.get(focusId) : tree.root;
    if (target && target !== scene.getFocus()) scene.goTo(target);
  }, [focusId, tree]);

  useEffect(() => {
    sceneRef.current?.setCardOpen(Boolean(card));
  }, [card]);

  const jump = useCallback(
    (n: TreeNode) => {
      const scene = sceneRef.current;
      if (!scene || !tree) return;
      setCard(null);
      setListOf(null);
      scene.goTo(n);
      cb.current.onFocusChange(n === tree.root ? null : n.id);
    },
    [tree],
  );

  const chain = focus && focus.lvl >= 0 ? chainOf(focus) : [];
  const listEntries = listOf ? collectEntries(listOf) : [];

  return (
    <div className="tree3d">
      <div className="tree3d-stage" ref={hostRef} />

      {err ? <div className="tree3d-err">{err}</div> : null}

      {/* 面包屑：3D 场景里没有"来路"的表达，靠它给出层级感 */}
      <div className="tree3d-crumb">
        <button type="button" className="home" onClick={() => tree && jump(tree.root)}>
          {t("tree3d.crumbRoot")}
        </button>
        {chain.slice(-4).map((n) => (
          <button
            type="button"
            key={n.id}
            className={n === focus ? "cur" : ""}
            onClick={() => jump(n)}
          >
            {labelOf(n)}
          </button>
        ))}
      </div>

      {tree ? (
        <div className="tree3d-stat">
          {tree.totalGot > 0
            ? t("tree3d.statGot", { count: tree.totalGot })
            : t("tree3d.statEmpty")}
        </div>
      ) : null}

      {/* ── 概要卡 ── */}
      {card ? (
        <NodeCard
          node={card}
          onClose={() => setCard(null)}
          onOpenList={() => setListOf(card)}
        />
      ) : null}

      {/* ── 详情视图：同一层的另一种呈现（3D 看结构，列表看收集）── */}
      {listOf ? (
        <TreeDetail
          node={listOf}
          entries={listEntries}
          onClose={() => setListOf(null)}
          onOpenEntry={(e) => cb.current.onOpenEntry(e)}
        />
      ) : null}
    </div>
  );
}

/** 概要卡：点树上任一级都从下方伸出，铺满底部宽度。 */
function NodeCard({
  node,
  onClose,
  onOpenList,
}: {
  node: TreeNode;
  onClose: () => void;
  onOpenList: () => void;
}) {
  const term = node.ch.length === 0;
  const sealed = Boolean(kvis(node.kingdom).dead);
  /* 子级规模。不能假设「子级阶元 = 自己 + 1」——
     GBIF 里同一个父节点下的子级 rank 可以不统一：
     Chordata 的 62 个子级是 16 纲 + 46 目（鱼类没有纲那一级，
     目直接挂在门下）。写死成 "62 纲" 就是在说谎。
     所以按子级实际的 lvl 分组统计。全骨架里 4% 的节点会走到多组分支。
     filler 子级不算：它们只是装饰，说"12 个属"也是谎话。 */
  const groups = new Map<number, number>();
  for (const c of node.ch) {
    if (c.src === "filler") continue;
    groups.set(c.lvl, (groups.get(c.lvl) ?? 0) + 1);
  }
  const meta: string[] = [];
  if (sealed) {
    /* 假枝丛不算细分。再说「还没有细分」像是在邀你往下走。 */
  } else if (term) meta.push(t("tree3d.noFurtherRank"));
  else if (groups.size > 0) {
    for (const [lvl, n] of [...groups].sort((a, b) => a[0] - b[0])) {
      meta.push(t("tree3d.childGroup", { count: n, rank: rankName(lvl) }));
    }
  } else meta.push(t("tree3d.noChildren"));

  return (
    <div className="tree3d-card is-on" style={{ ["--kc" as string]: kingdomHex(node.kingdom) }}>
      <div className={`tree3d-card-th${node.coverUrl ? "" : " off"}`}>
        {node.coverUrl ? <img src={node.coverUrl} alt="" /> : null}
      </div>
      <div className="tree3d-card-b">
        <div className="tree3d-card-h">
          <b>{labelOf(node)}</b>
          <span className="rank">{rankName(node.lvl)}</span>
          <i>{node.la}</i>
        </div>
        <div className="tree3d-card-m">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      </div>
      {node.got > 0 ? (
        <button type="button" className="tree3d-card-go" onClick={onOpenList}>
          {t("tree3d.viewCollection")}
          <em>{t("tree3d.gotCountGo", { count: node.got })}</em>
        </button>
      ) : sealed ? (
        <button type="button" className="tree3d-card-go off" disabled>
          {t("tree3d.notCollectible")}
          <em>{t("tree3d.notCollectibleHint")}</em>
        </button>
      ) : (
        <button type="button" className="tree3d-card-go off" disabled>
          {t("tree3d.noFootprint")}
          <em>{node.lvl >= 6 ? t("tree3d.notCollectedSpecies") : t("tree3d.notCollectedBranch")}</em>
        </button>
      )}
      <button type="button" className="tree3d-card-x" onClick={onClose} aria-label={t("tree3d.close")}>
        ×
      </button>
    </div>
  );
}

/**
 * 详情视图。
 *
 * 这是 3D 树与「看收集」的分工：3D 树只管骨架导航（我在生物界的哪个位置），
 * 具体拍到了什么用普通 CSS 网格展示 —— 这是 CSS 擅长的，也顺带化解了
 * 「非种级叶子」：识别只到科的条目就出现在科的详情里，3D 不必特殊表达。
 */
function TreeDetail({
  node,
  entries,
  onClose,
  onOpenEntry,
}: {
  node: TreeNode;
  entries: CollectionEntry[];
  onClose: () => void;
  onOpenEntry: (e: CollectionEntry) => void;
}) {
  const chain = chainOf(node);
  return (
    <div className="tree3d-sheet is-on">
      <header>
        <button type="button" className="back" onClick={onClose}>
          {t("tree3d.backToTree")}
        </button>
        <div className="path">{chain.map((n) => labelOf(n)).join(" › ")}</div>
        <h2>
          {labelOf(node)}
          <span className="rank">{rankName(node.lvl)}</span>
        </h2>
        <p className="la">{node.la}</p>
        <p className="sum">
          {t("tree3d.sheetSum", { count: node.got })}
          {entries.length < node.got ? t("tree3d.sheetCap", { shown: entries.length }) : ""}
        </p>
      </header>
      <div className="grid">
        {entries.map((e) => (
          <button type="button" key={e.id} className="cell" onClick={() => onOpenEntry(e)}>
            <div className="art">
              {e.coverDisplayUrl ? <img src={e.coverDisplayUrl} alt="" loading="lazy" /> : null}
            </div>
            <span className="nm">{e.commonName || e.scientificName || t("tree3d.unnamed")}</span>
            {e.scientificName && e.commonName ? <span className="sci">{e.scientificName}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
