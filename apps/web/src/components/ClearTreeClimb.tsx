import { t } from "@biotrace/messages";
import { collectionTreeSceneUrl } from "../themes/collectionAssets";
import { speciesEntryName } from "../speciesSearch";
import { UNPLACED_LATIN, type TreeFolder, type TreeItem } from "../treeBuild";
import type { TreeLayerViewProps } from "./TreeDeck";
import "./ClearTreeClimb.css";

const CROWN_SLOTS: [number, number][] = [
  [50, 11],
  [24, 18],
  [76, 18],
  [12, 34],
  [88, 34],
  [34, 40],
  [66, 40],
  [20, 52],
  [80, 52],
  [42, 26],
  [58, 26],
  [50, 48],
  [30, 58],
  [70, 58],
  [16, 24],
  [84, 24],
];

const FORK_SLOTS: Record<number, [number, number][]> = {
  1: [[50, 14]],
  2: [
    [28, 16],
    [72, 16],
  ],
  3: [
    [22, 28],
    [50, 16],
    [78, 30],
  ],
  4: [
    [16, 24],
    [38, 13],
    [62, 13],
    [84, 24],
  ],
};

function folderName(folder: TreeFolder) {
  if (folder.rank === "unplaced") return t("collection.treeUnplaced");
  return folder.name;
}

function pickSlots(n: number): [number, number][] {
  const len = CROWN_SLOTS.length;
  if (n >= len) return CROWN_SLOTS.slice();
  const used = new Set<number>();
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let idx = Math.round((i * (len - 1)) / Math.max(1, n - 1));
    while (used.has(idx) && used.size < len) idx = (idx + 1) % len;
    used.add(idx);
    out.push(CROWN_SLOTS[idx]);
  }
  return out;
}

type Route = {
  key: string;
  name: string;
  folder?: TreeFolder;
  entryId?: string;
};

/**
 * 清透收集树：这一层几个孩子，仰视长成哪一档。
 * 未归类只在根层、落在根边，不占主枝。点枝 = 现在的 openFolder / 种卡片。
 */
export function ClearTreeClimb({ items, path, onOpenFolder, onOpenLeaf }: TreeLayerViewProps) {
  const unplaced = items.filter(
    (item): item is Extract<TreeItem, { kind: "folder" }> =>
      item.kind === "folder" && item.latin === UNPLACED_LATIN,
  );
  const routes: Route[] = [];
  for (const item of items) {
    if (item.kind === "folder" && item.latin === UNPLACED_LATIN) continue;
    if (item.kind === "folder") {
      routes.push({ key: `f-${item.latin}`, name: folderName(item), folder: item });
    } else {
      routes.push({
        key: `l-${item.entry.id}`,
        name: speciesEntryName(item.entry, t("detail.unnamed")),
        entryId: item.entry.id,
      });
    }
  }
  const n = routes.length;
  const scene = collectionTreeSceneUrl(n);
  const sceneKind = n <= 0 ? "" : n === 1 ? " is-one" : n <= 4 ? " is-fork" : " is-crown";
  const slots = n <= 4 ? (FORK_SLOTS[n] ?? pickSlots(n)) : pickSlots(n);
  const leavesById = new Map(
    items.filter((i) => i.kind === "leaf").map((i) => [i.entry.id, i.entry]),
  );

  function onTip(route: Route) {
    if (route.folder) onOpenFolder(route.folder, null);
    else if (route.entryId) {
      const entry = leavesById.get(route.entryId);
      if (entry) onOpenLeaf(entry);
    }
  }

  const showUnplaced = path.length === 0 && unplaced[0];

  return (
    <div className={`clear-tree-climb${sceneKind}${n >= 8 ? " is-tall" : ""}`}>
      {scene ? <img className="clear-tree-climb-scene" src={scene} alt="" /> : null}
      {routes.map((route, i) => {
        const slot = slots[i] ?? pickSlots(Math.max(n, i + 1))[i] ?? [50, 20];
        return (
          <button
            key={route.key}
            type="button"
            className="clear-tree-tip"
            style={{ left: `${slot[0]}%`, top: `${slot[1]}%` }}
            onClick={() => onTip(route)}
          >
            {route.name}
          </button>
        );
      })}
      {showUnplaced ? (
        <button
          type="button"
          className="clear-tree-tip is-ground"
          style={{ left: "18%", top: "88%" }}
          onClick={() => onOpenFolder(unplaced[0], null)}
        >
          {t("collection.treeUnplaced")}
        </button>
      ) : null}
    </div>
  );
}
