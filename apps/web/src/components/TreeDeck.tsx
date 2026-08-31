import { hasMessage, t, type MessageKey } from "@biotrace/messages";
import type { CollectionEntry, Rarity } from "../api";
import { speciesEntryName } from "../speciesSearch";
import {
  folderIsUnaryGenus,
  type TreeFolder,
  type TreeItem,
} from "../treeBuild";
import { setTreeOpenHandoff } from "../treeOpenHandoff";
import { measureBox } from "../motion";

function rarityLabel(r: Rarity) {
  const key = `rarity.${r}`;
  return hasMessage(key) ? t(key as MessageKey) : r;
}

function folderName(folder: TreeFolder) {
  if (folder.rank === "unplaced") return t("collection.treeUnplaced");
  return folder.name;
}

export type TreeLayerViewProps = {
  items: TreeItem[];
  path: string[];
  entries: CollectionEntry[];
  sourceLatin: string | null;
  split: boolean;
  onOpenFolder: (folder: TreeFolder, art: HTMLElement | null) => void;
  onOpenLeaf: (entry: CollectionEntry) => void;
};

/** 默认皮肤：文件夹宫格。 */
export function TreeDeck({
  items,
  path,
  entries,
  sourceLatin,
  split,
  onOpenFolder,
  onOpenLeaf,
}: TreeLayerViewProps) {
  return (
    <div className={`tree-deck${split ? " is-split" : ""}`}>
      {items.map((item) => {
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
                onOpenFolder(item, art instanceof HTMLElement ? art : null);
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
            onClick={() => onOpenLeaf(entry)}
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
  );
}
