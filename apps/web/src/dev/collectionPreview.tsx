import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { t } from "@biotrace/messages";
import CollectionPage from "../pages/CollectionPage";
import { api, type CollectionEntry, type PetCollectionEntry } from "../api";
import { applyTheme, isThemeId } from "../themes/core";
import { rememberCollection } from "../pageCache";
import { countTreeKingdoms } from "../treeBuild";
import CollectionPetCardPage from "../pages/CollectionPetCardPage";
import CollectionSpeciesCardPage from "../pages/CollectionSpeciesCardPage";
import { RealLocationContext } from "../realLocation";
import PageOverlay from "../PageOverlay";
import "../styles.css";
import "../themes/clear.css";
import "../themes/daylight.css";

// Dev-only review fixtures. No account, database, or production route is involved.
const params = new URLSearchParams(location.search);
const theme = params.get("theme");
applyTheme(isThemeId(theme) ? theme : "clear");
const state = params.get("state") ?? "full";
const userId = `collection-preview:${state}`;
document.documentElement.dataset.reviewState = state;
const width = Math.max(320, Math.min(1440, Number(params.get("width")) || 390));
const photo = (name: string) => `/themes/_demo/demo-photo-${name}.jpg`;
const specimen = (id: string, name: string, kingdom: string, image: string): CollectionEntry => ({
  id, commonName: name, scientificName: name, taxonKey: name, rarity: "R",
  coverObservationId: id, coverDisplayUrl: image, firstCollectedAt: "2026-09-01", updatedAt: "2026-09-01",
  taxonomy: { kingdom: { name_la: kingdom, name_zh: null } } as CollectionEntry["taxonomy"],
});
let entries = [
  specimen("bird", "Parus major", "Animalia", photo("bird")),
  specimen("mushroom", "Agaricales", "Fungi", photo("mushroom")),
  specimen("butterfly", "Papilio", "Animalia", photo("butterfly")),
];
let pets: PetCollectionEntry[] = [
  specimen("pet", "Melopsittacus undulatus", "Animalia", photo("bird")),
  specimen("pet-2", "Nymphicus hollandicus", "Animalia", photo("bird")),
  specimen("pet-3", "Serinus canaria", "Animalia", photo("bird")),
];
if (state === "empty") { entries = []; pets = []; }
if (state === "single") { entries = entries.slice(0, 1); pets = []; }
if (state === "missing") {
  entries = entries.map((entry) => ({ ...entry, coverDisplayUrl: null }));
  pets = pets.map((entry) => ({ ...entry, coverDisplayUrl: null }));
}
if (state === "long") entries = entries.map((entry) => ({ ...entry, commonName: "Pseudopseudohypoparathyroidism".repeat(2) }));
if (state === "large") { entries = Array.from({ length: 5000 }, (_, i) => ({ ...entries[i % entries.length]!, id: `large-${i}` })); pets = []; }
if (state === "broken") entries = entries.map((entry) => ({ ...entry, coverDisplayUrl: "/themes/_demo/missing-fixture.jpg" }));
if (state === "cached" || state === "refresh") rememberCollection(userId, {
  entries, petEntries: pets, entryCount: entries.length + pets.length, petCount: pets.length,
  kingdomCount: countTreeKingdoms([...entries, ...pets]),
});
api.listCollection = async () => {
  if (state === "loading" || state === "cached") return new Promise(() => {});
  if (state === "error") throw new Error(t("collection.loadFailed"));
  if (state === "refresh") {
    await new Promise(resolve => setTimeout(resolve, 3000));
    return { entries: [specimen("inserted", "New specimen", "Plantae", photo("dragonfly")), ...entries] };
  }
  return { entries };
};
api.listPetCollection = async () => {
  if (state === "pet-error") throw new Error(t("collection.loadFailed"));
  return { entries: pets };
};
api.getCollectionEntry = async id => ({ entry: entries.find(e => e.id === id)!, sightings: [] });
api.getPetCollectionEntry = async id => ({ entry: pets.find(e => e.id === id)!, sightings: [] });

function PreviewRoutes() {
  const location = useLocation();
  return <RealLocationContext.Provider value={location}><Routes>
    <Route path="/collection" element={<CollectionPage userId={userId} />} />
    <Route path="/collection/species/pet/:id" element={<PageOverlay className="is-species"><CollectionPetCardPage /></PageOverlay>} />
    <Route path="/collection/species/:id" element={<PageOverlay className="is-species"><CollectionSpeciesCardPage /></PageOverlay>} />
  </Routes></RealLocationContext.Provider>;
}

createRoot(document.querySelector("#root")!).render(
  <React.StrictMode>
    <MemoryRouter initialEntries={["/collection"]}>
      <div className="app-shell" style={{ width, height: 844, minHeight: 844, maxHeight: 844 }}>
        <header className="app-topbar"><span className="app-wordmark">BioTrace</span></header>
        <main className="content"><PreviewRoutes /></main>
        <nav className="nav">
          <a href="/">{t("nav.trips")}</a><a href="/map">{t("nav.map")}</a>
          <a className="active" href="/collection">{t("nav.collection")}</a><a href="/me">{t("nav.me")}</a>
        </nav>
      </div>
    </MemoryRouter>
  </React.StrictMode>,
);
