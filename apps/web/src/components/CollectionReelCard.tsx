import { useState } from "react";
import { Link } from "react-router-dom";
import { hasMessage, t, type MessageKey } from "@biotrace/messages";
import { speciesEntryName, type SpeciesIndexRow } from "../speciesSearch";
import { MeRowIcon } from "./MeRowIcon";

export function CollectionReelCard({ entry, index, href = entry.href, origin = "/collection", onNavigate }: {
  entry: SpeciesIndexRow;
  index: number;
  href?: string;
  origin?: string | null;
  onNavigate?: () => void;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const name = speciesEntryName(entry, t("detail.unnamed"));
  const rankKey = `rarity.${entry.rarity}`;
  const rankTitle = hasMessage(rankKey) ? t(rankKey as MessageKey) : entry.rarity ?? "";
  const photo = entry.coverDisplayUrl && entry.coverDisplayUrl !== failedUrl ? entry.coverDisplayUrl : null;
  return <Link className="collection-reel-card" to={href} state={origin ? { from: origin } : undefined} onClick={onNavigate} aria-label={name}>
    <span className="collection-reel-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
    <div className="collection-reel-photo">
      {photo ? <img src={photo} alt="" loading="eager" decoding="async" draggable={false} onError={() => setFailedUrl(photo)} /> : <MeRowIcon name="species" />}
    </div>
    <div className="collection-reel-caption">
      <span className="collection-reel-name" title={name}>{name}</span>
      {entry.rarity ? <span className={`collection-reel-rank rarity-badge rarity-${entry.rarity}`} title={rankTitle}>{entry.rarity}</span> : null}
      <span className="collection-reel-latin" title={entry.scientificName ?? undefined}>{entry.scientificName}</span>
    </div>
  </Link>;
}
