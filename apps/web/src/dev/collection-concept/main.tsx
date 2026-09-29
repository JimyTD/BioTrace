import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Link, useLocation, useNavigate, useParams, Route, Routes } from "react-router-dom";
import { hasMessage, t, type MessageKey } from "@biotrace/messages";
import { api, type CollectionEntry, type PetCollectionEntry } from "../../api";
import { MeRowIcon } from "../../components/MeRowIcon";
import { ListTagRow } from "../../components/ListTagRow";
import SpeciesTree3D from "../../components/SpeciesTree3D";
import { applyTheme, isThemeId, type ThemeId } from "../../themes/core";
import { collectionTreeDoorUrl } from "../../themes/collectionAssets";
import { countTreeKingdoms } from "../../treeBuild";
import { buildSpeciesFuse, filterSpecies, indexSpecies, petToIndexRow, sortSpecies, speciesEntryName, wildToIndexRow, type SpeciesIndexRow, type SpeciesSort } from "../../speciesSearch";
import { sampleEntries, samplePets } from "./fixtures";
import { CollectionReel } from "../../components/CollectionReel";
import { CollectionReelCard } from "../../components/CollectionReelCard";
import "../../styles.css";
import "../../themes/clear.css";
import "../../themes/daylight.css";
import "./clear.css";
import "./daylight.css";
import "./layout.css";
import "./conveyor.css";

type Dataset = { entries: CollectionEntry[]; pets: PetCollectionEntry[] };
type DraftRow = SpeciesIndexRow & { firstCollectedAt: string };
const params = new URLSearchParams(location.search);
const initialTheme = params.get("theme");
const source = params.get("data") === "live" ? "live" : "sample";
const startingTheme: ThemeId = isThemeId(initialTheme) ? initialTheme : "clear";
applyTheme(startingTheme);

function sampleData(): Dataset {
  const state = params.get("state");
  if (state === "empty") return { entries: [], pets: [] };
  if (state === "single") return { entries: sampleEntries.slice(0, 1), pets: [] };
  if (state === "large") return { entries: Array.from({ length: 5000 }, (_, index) => ({ ...sampleEntries[index % sampleEntries.length]!, id: `large-${index}` })), pets: [] };
  if (state === "long") return { entries: sampleEntries.map(e => ({ ...e, commonName: "Pseudopseudohypoparathyroidism", scientificName: "Pseudopseudohypoparathyroidism specimen longum" })), pets: samplePets };
  return { entries: sampleEntries, pets: samplePets };
}

function rankTitle(rank: string) {
  const key = `rarity.${rank}`;
  return hasMessage(key) ? t(key as MessageKey) : rank;
}

function Rank({ rank }: { rank: string | null }) {
  return rank ? <span className={`concept-rank rarity-badge rarity-${rank}`} title={rankTitle(rank)}>{rank}</span> : null;
}

function Specimen({ entry, index, eager = false }: { entry: DraftRow; index: number; eager?: boolean }) {
  const name = speciesEntryName(entry, t("detail.unnamed"));
  return (
    <Link className="concept-specimen" to={`/entry/${encodeURIComponent(entry.rowKey)}`} aria-label={name}>
      <span className="concept-paper-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div className="concept-photo">
        {entry.coverDisplayUrl ? <img src={entry.coverDisplayUrl} alt="" loading={eager || index < 4 ? "eager" : "lazy"} decoding="async" draggable={false} /> : <MeRowIcon name="species" />}
      </div>
      <div className="concept-caption">
        <span className="concept-card-name" title={name}>{name}</span>
        <Rank rank={entry.rarity} />
        <span className="concept-latin" title={entry.scientificName ?? undefined}>{entry.scientificName}</span>
      </div>
    </Link>
  );
}

function Header({ total }: { total: number }) {
  return <header className="concept-heading">
    <div><h1>{t("collection.title")}</h1><p>{t("collection.lede")}</p></div>
    <Link className="concept-total" to="/all"><strong>{total}</strong><span>{t("collection.speciesTitle")} <span aria-hidden="true">↗</span></span></Link>
  </header>;
}

function Home({ rows, data }: { rows: DraftRow[]; data: Dataset }) {
  return <div className="concept-home is-reel-home">
    <Header total={rows.length} />
    <CollectionReel items={rows} allHref="/all" storageKey={`bt_collection_reel_v1:${source}:${params.get("state") ?? "default"}`} reducedMotion={params.get("motion") === "reduce"} renderItem={(entry, index) => <CollectionReelCard entry={entry} index={index} href={`/entry/${encodeURIComponent(entry.rowKey)}`} origin={null} />} />
    <div className="concept-secondary">
      <Link className="concept-door concept-pets-door" to="/pets">
        <MeRowIcon name="pets" />
        <span className="concept-door-copy"><strong>{t("collection.petsTitle")}</strong><span>{t("collection.speciesCount", { count: data.pets.length })}</span></span>
        <span className="concept-door-arrow" aria-hidden="true">↗</span>
      </Link>
      <Link className="concept-door concept-tree-door" to="/tree">
        <span className="concept-tree-thumb" aria-hidden="true"><img src={collectionTreeDoorUrl() ?? undefined} alt="" /></span>
        <span className="concept-door-copy"><strong>{t("collection.treeTitle")}</strong><span>{t("collection.treeCount", { count: countTreeKingdoms([...data.entries, ...data.pets]) })}</span></span>
        <span className="concept-door-arrow" aria-hidden="true">↗</span>
      </Link>
    </div>
  </div>;
}

function Catalog({ rows, pets = false }: { rows: DraftRow[]; pets?: boolean }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SpeciesSort>("recent");
  const indexed = useMemo(() => rows.map(indexSpecies), [rows]);
  const fuse = useMemo(() => buildSpeciesFuse(indexed), [indexed]);
  const visible = sortSpecies(filterSpecies(indexed, fuse, query), sort);
  const byKey = new Map(rows.map(row => [row.rowKey, row]));
  return <div className="concept-catalog">
    <Link className="concept-back" to="/">← {t("collection.title")}</Link>
    <div className="concept-section-head"><h1>{t(pets ? "collection.petsTitle" : "collection.speciesTitle")}</h1><span>{t("collection.speciesCount", { count: rows.length })}</span></div>
    {!!rows.length && <div className="concept-tools"><input className="input" aria-label={t("collection.speciesSearch")} placeholder={t("collection.speciesSearch")} value={query} onChange={e => setQuery(e.target.value)} /><select className="input" aria-label={t("collection.speciesSortRecent")} value={sort} onChange={e => setSort(e.target.value as SpeciesSort)}><option value="recent">{t("collection.speciesSortRecent")}</option><option value="rarity">{t("collection.speciesSortRarity")}</option><option value="name">{t("collection.speciesSortName")}</option></select></div>}
    {visible.length ? <div className="concept-grid">{visible.map((row, index) => <Specimen key={row.rowKey} entry={byKey.get(row.rowKey)!} index={index} />)}</div> : <p className="concept-empty">{t(rows.length ? "collection.speciesNoMatch" : pets ? "collection.petsEmpty" : "collection.empty")}</p>}
  </div>;
}

function Detail({ rows }: { rows: DraftRow[] }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const entry = rows.find(e => e.rowKey === id);
  if (!entry) return <Link className="concept-back" to="/">← {t("common.back")}</Link>;
  return <article className="concept-detail">
    <button type="button" className="concept-back" onClick={() => navigate(-1)}>← {t("common.back")}</button>
    <div className="concept-detail-photo">{entry.coverDisplayUrl ? <img src={entry.coverDisplayUrl} alt={speciesEntryName(entry)} /> : <MeRowIcon name="species" />}</div>
    <div className="concept-detail-heading"><h1>{speciesEntryName(entry, t("detail.unnamed"))}</h1><Rank rank={entry.rarity} /></div>
    <p className="concept-detail-latin">{entry.scientificName}</p>
    <ListTagRow tags={entry.tags} />
    <p className="concept-detail-date">{t("collection.speciesFirstCollected", { date: new Date(entry.firstCollectedAt).toLocaleDateString("zh-CN") })}</p>
  </article>;
}

function Tree({ data }: { data: Dataset }) {
  const [focus, setFocus] = useState<string | null>(null);
  const navigate = useNavigate();
  const entries = useMemo(() => [...data.entries.map(e => ({ ...e, track: "wild" as const })), ...data.pets.map(e => ({ ...e, track: "pet" as const }))], [data]);
  return <div className="concept-tree-scene"><SpeciesTree3D entries={entries} focusId={focus} onFocusChange={setFocus} onLeave={() => navigate("/")} onOpenEntry={e => navigate(`/entry/${encodeURIComponent(`${e.track}:${e.id}`)}`)} /></div>;
}

function ConceptApp() {
  const [theme, setTheme] = useState<ThemeId>(startingTheme);
  const [data, setData] = useState<Dataset>(source === "sample" ? sampleData : { entries: [], pets: [] });
  const [loading, setLoading] = useState(source === "live");
  const [error, setError] = useState(false);
  const location = useLocation();
  useEffect(() => {
    if (source !== "live") return;
    let active = true;
    Promise.all([api.listCollection(), api.listPetCollection()]).then(([wild, pets]) => {
      if (active) setData({ entries: wild.entries, pets: pets.entries });
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { document.querySelector(".concept-content")?.scrollTo(0, 0); }, [location.pathname]);
  const rows = useMemo(() => [
    ...data.entries.map(e => ({ ...wildToIndexRow(e), firstCollectedAt: e.firstCollectedAt })),
    ...data.pets.map(e => ({ ...petToIndexRow(e), firstCollectedAt: e.firstCollectedAt })),
  ], [data]);
  function changeSource(value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("data", value); url.searchParams.set("theme", theme); url.hash = "/";
    window.location.assign(url);
  }
  function changeTheme(value: string) {
    if (!isThemeId(value)) return;
    applyTheme(value);
    setTheme(value);
    const url = new URL(window.location.href);
    url.searchParams.set("theme", value);
    window.history.replaceState(window.history.state, "", url);
  }
  return <div className="concept-workbench">
    <aside className="concept-reviewbar" aria-label={t("collectionDraft.title")}>
      <span>{t("collectionDraft.title")}</span>
      <select aria-label={t("collectionDraft.theme")} value={theme} onChange={e => changeTheme(e.target.value)}><option value="clear">{t("theme.clear")}</option><option value="daylight">{t("theme.daylight")}</option></select>
      <select aria-label={t("collectionDraft.data")} value={source} onChange={e => changeSource(e.target.value)}><option value="sample">{t("collectionDraft.sample")}</option><option value="live">{t("collectionDraft.live")}</option></select>
      <a href="/collection">{t("collectionDraft.original")} ↗</a>
    </aside>
    <div className="concept-app" data-theme={theme}>
      <header className="concept-brand"><span>BioTrace</span></header>
      <main className={`concept-content${location.pathname === "/tree" ? " is-tree" : ""}`}>
        {loading ? <p className="concept-empty">{t("app.loading")}</p> : error ? <p className="error">{t("collection.loadFailed")}</p> : <Routes>
          <Route path="/" element={<Home rows={rows} data={data} />} />
          <Route path="/all" element={<Catalog rows={rows} />} />
          <Route path="/pets" element={<Catalog rows={rows.filter(e => e.track === "pet")} pets />} />
          <Route path="/entry/:id" element={<Detail rows={rows} />} />
          <Route path="/tree" element={<Tree data={data} />} />
        </Routes>}
      </main>
      <nav className="concept-nav"><a href="/">{t("nav.trips")}</a><a href="/map">{t("nav.map")}</a><Link className="active" to="/">{t("nav.collection")}</Link><a href="/me">{t("nav.me")}</a></nav>
    </div>
  </div>;
}

createRoot(document.querySelector("#root")!).render(<HashRouter><ConceptApp /></HashRouter>);
