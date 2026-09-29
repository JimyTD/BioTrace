import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Link, useNavigate, useParams, Route, Routes } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api } from "../../api";
import { applyTheme, isThemeId, type ThemeId } from "../../themes/core";
import { captureCoverBox, setOpenBookHandoff } from "../../openBookHandoff";
import TripBookLayer, { OpenBookCloseContext } from "../../components/TripBookLayer";
import { sampleTrips, type PreviewTrip } from "./fixtures";
import "../../styles.css";
import "../../themes/clear.css";
import "../../themes/daylight.css";
import "./themes.css";
import "./layout.css";

const params = new URLSearchParams(window.location.search);
const requestedTheme = params.get("theme");
const startingTheme = isThemeId(requestedTheme) ? requestedTheme : "clear";
const source = params.get("data") ?? "samples";
applyTheme(startingTheme);

type IconName = "plus" | "search" | "x" | "users" | "arrow-left" | "arrow-up-right";
function Icon({ name }: { name: IconName }) {
  return <img className="journey-icon" src={`/devpages/trips-icons/${name}.svg`} alt="" aria-hidden="true" />;
}

function Book({ trip, number }: { trip: PreviewTrip; number: number }) {
  return <span className="journey-book trip-cover-slot" aria-hidden="true">
    <span className="trip-cover">
      <span className="trip-cover-media" />
      <span className="trip-cover-window">
        {trip.coverDisplayUrl ? <img className="trip-cover-photo" src={trip.coverDisplayUrl} alt="" loading={number < 4 ? "eager" : "lazy"} /> : <span className="journey-blank-cover"><span>{String(number + 1).padStart(2, "0")}</span></span>}
      </span>
    </span>
  </span>;
}

function Entry({ trip, index, activeId }: { trip: PreviewTrip; index: number; activeId?: string }) {
  const navigate = useNavigate();
  return <button type="button" className={`journey-entry${trip.id === activeId ? " is-source" : ""}`} onClick={event => {
    const cover = event.currentTarget.querySelector(".trip-cover-media");
    if (cover instanceof HTMLElement) setOpenBookHandoff({ tripId: trip.id, coverUrl: trip.coverDisplayUrl ?? null, source: captureCoverBox(cover) });
    navigate(`/trips/${trip.id}`);
  }}>
    <Book trip={trip} number={index} />
    <span className="journey-copy">
      <strong className="journey-title" title={trip.title}>{trip.title}</strong>
      {trip.dateSummary ? <span className="journey-date">{trip.dateSummary}</span> : null}
      {trip.placeSummary ? <span className="journey-place" title={trip.placeSummary}>{trip.placeSummary}</span> : null}
      <span className="journey-footnote"><span>{t(trip.observationCount ? "trips.photoCount" : "trips.noPhotosYet", { count: trip.observationCount ?? 0 })}</span>
        {(trip.memberCount ?? 1) > 1 ? <span className="journey-companions" title={t("trips.memberCount", { count: trip.memberCount! })}><Icon name="users" />{trip.memberCount}</span> : null}
      </span>
    </span>
    <span className="journey-open-arrow"><Icon name="arrow-up-right" /></span>
  </button>;
}

function CreateDialog({ close, add }: { close: () => void; add: (trip: PreviewTrip) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"new" | "join">("new");
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => { dialogRef.current?.showModal(); dialogRef.current?.querySelector("input")?.focus(); }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    if (mode === "join" && value.trim().toUpperCase() !== "DEMO26") { setError(true); return; }
    const shared = sampleTrips("samples")[0]!;
    add(mode === "join" ? { ...shared, id: `joined-${Date.now()}` } : {
      id: `local-${Date.now()}`, title: value.trim(), userId: "preview", createdAt: new Date().toISOString(),
      observationCount: 0, coverDisplayUrl: null, memberCount: 1, samplePhotos: [],
    });
    close();
  }
  return <dialog ref={dialogRef} className="journey-dialog" aria-labelledby="journey-dialog-title" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="journey-dialog-body">
      <div className="journey-dialog-head"><h2 id="journey-dialog-title">{t(mode === "new" ? "trips.createLabel" : "trips.joinAction")}</h2><button type="button" className="journey-icon-button" title={t("tripsDraft.close")} aria-label={t("tripsDraft.close")} onClick={close}><Icon name="x" /></button></div>
      <div className="journey-modes" role="group" aria-label={t("tripsDraft.add")}><button type="button" aria-pressed={mode === "new"} onClick={() => { setMode("new"); setValue(""); setError(false); }}>{t("trips.createLabel")}</button><button type="button" aria-pressed={mode === "join"} onClick={() => { setMode("join"); setValue(""); setError(false); }}>{t("trips.joinAction")}</button></div>
      <form onSubmit={submit}>
        <label htmlFor="preview-title">{t(mode === "new" ? "trips.createLabel" : "trips.joinLabel")}</label>
        <input id="preview-title" className="input" autoFocus value={value} autoComplete="off" onChange={event => { setValue(event.target.value); setError(false); }} />
        {mode === "join" ? <p className="journey-demo-code">{t("tripsDraft.sampleCode")} <code>DEMO26</code></p> : null}
        {error ? <p className="error">{t("share.inviteInvalid")}</p> : null}
        <button className="btn" disabled={!value.trim()} type="submit">{t(mode === "new" ? "trips.createAction" : "trips.joinAction")}</button>
      </form>
    </div>
  </dialog>;
}

function AlbumPreview({ trip }: { trip: PreviewTrip }) {
  const closeBook = useContext(OpenBookCloseContext);
  const [photos, setPhotos] = useState(trip.samplePhotos ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (source !== "live") return;
    let active = true;
    api.listTripObservations(trip.id).then(result => { if (active) setPhotos(result.observations.map(o => o.displayUrl)); }).catch(() => {});
    return () => { active = false; };
  }, [trip.id]);
  return <div className="journey-album">
    <button type="button" className="journey-back" onClick={() => closeBook?.()}><Icon name="arrow-left" />{t("trips.title")}</button>
    <h1>{trip.title}</h1><p className="journey-album-meta">{[trip.dateSummary, trip.placeSummary].filter(Boolean).join(" · ")}</p>
    {photos.length ? <div className="journey-album-grid">{photos.map((photo, index) => <button type="button" key={`${photo}-${index}`} onClick={() => setSelected(photo)} aria-label={`${t("trips.manageBack")} ${index + 1}`}><img src={photo} alt="" loading="lazy" /><span>{String(index + 1).padStart(2, "0")}</span></button>)}</div> : <p className="journey-empty">{t("album.empty")}</p>}
    {selected ? <PhotoView photo={selected} close={() => setSelected(null)} /> : null}
  </div>;
}

function PhotoView({ photo, close }: { photo: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="journey-photo-dialog" onCancel={close} onClick={close}><button type="button" className="journey-icon-button" aria-label={t("tripsDraft.close")} title={t("tripsDraft.close")} onClick={close}><Icon name="x" /></button><img src={photo} alt="" /></dialog>;
}

function Shelf({ trips, add, loading, error }: { trips: PreviewTrip[]; add: (trip: PreviewTrip) => void; loading: boolean; error: boolean }) {
  const { id } = useParams();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState(false);
  const [creating, setCreating] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (search) input.current?.focus(); }, [search]);
  const normalized = query.trim().toLocaleLowerCase();
  const visible = trips.filter(trip => `${trip.title} ${trip.placeSummary ?? ""}`.toLocaleLowerCase().includes(normalized));
  const current = trips.find(trip => trip.id === id);
  return <>
    <div className="page-trips journey-shelf" inert={!!id}>
      <header className="journey-heading">
        <div><h1>{t("trips.title")}</h1><p>{t("trips.lede")}</p></div>
        <div className="journey-heading-actions"><button type="button" className="journey-icon-button" aria-label={t("tripsDraft.search")} title={t("tripsDraft.search")} aria-expanded={search} onClick={() => { setSearch(open => !open); setQuery(""); }}><Icon name={search ? "x" : "search"} /></button><button type="button" className="journey-icon-button is-add" aria-label={t("tripsDraft.add")} title={t("tripsDraft.add")} onClick={() => setCreating(true)}><Icon name="plus" /></button></div>
      </header>
      {search ? <div className="journey-search"><Icon name="search" /><input ref={input} value={query} onChange={event => setQuery(event.target.value)} placeholder={t("tripsDraft.search")} aria-label={t("tripsDraft.search")} /></div> : null}
      <div className="journey-index-head"><span>{t("tripsDraft.count", { count: trips.length })}</span></div>
      {loading ? <p className="journey-empty">{t("trips.loading")}</p> : error ? <p className="error">{t("common.loadFailed")}</p> : <div className="journey-list">{visible.map((trip, index) => <Entry key={trip.id} trip={trip} index={index} activeId={id} />)}</div>}
      {!loading && !error && !visible.length ? <div className="journey-empty"><p>{t(trips.length ? "tripsDraft.noMatch" : "trips.empty")}</p>{!trips.length && <button className="btn" onClick={() => setCreating(true)}>{t("trips.createLabel")}</button>}</div> : null}
    </div>
    {creating ? <CreateDialog close={() => setCreating(false)} add={add} /> : null}
    {current ? <TripBookLayer key={current.id} tripId={current.id}><AlbumPreview trip={current} /></TripBookLayer> : null}
  </>;
}

function App() {
  const [theme, setTheme] = useState<ThemeId>(startingTheme);
  const [trips, setTrips] = useState<PreviewTrip[]>(source === "live" ? [] : sampleTrips(source));
  const [loading, setLoading] = useState(source === "live");
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (source !== "live") return;
    let active = true;
    api.listTrips().then(result => { if (active) setTrips(result.trips); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  function changeTheme(value: string) {
    if (!isThemeId(value)) return;
    applyTheme(value); setTheme(value);
    const url = new URL(window.location.href); url.searchParams.set("theme", value); window.history.replaceState(window.history.state, "", url);
  }
  function changeSource(value: string) {
    const url = new URL(window.location.href); url.searchParams.set("data", value); url.hash = "/"; window.location.assign(url);
  }
  const shelf = <Shelf trips={trips} loading={loading} error={error} add={trip => { setTrips(rows => [trip, ...rows]); navigate("/"); }} />;
  return <div className="journey-workbench">
    <aside className="journey-reviewbar" aria-label={t("tripsDraft.title")}><span>{t("tripsDraft.title")}</span><select aria-label={t("tripsDraft.theme")} value={theme} onChange={event => changeTheme(event.target.value)}><option value="clear">{t("theme.clear")}</option><option value="daylight">{t("theme.daylight")}</option></select><select aria-label={t("tripsDraft.data")} value={source} onChange={event => changeSource(event.target.value)}>{(["samples", "single", "many", "empty", "long", "live"] as const).map(key => <option value={key} key={key}>{t(`tripsDraft.${key}`)}</option>)}</select><a href="/">{t("tripsDraft.original")} ↗</a></aside>
    <div className="app-shell"><header className="app-topbar"><span className="app-wordmark">BioTrace</span></header><main className="content"><Routes><Route path="/" element={shelf} /><Route path="/trips/:id" element={shelf} /></Routes></main><nav className="nav"><Link className="active" to="/">{t("nav.trips")}</Link><a href="/map">{t("nav.map")}</a><a href="/collection">{t("nav.collection")}</a><a href="/me">{t("nav.me")}</a></nav></div>
  </div>;
}
const root = createRoot(document.querySelector("#root")!);
root.render(<HashRouter><App /></HashRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
