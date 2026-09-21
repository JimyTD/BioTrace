import type { CollectionEntry, PetCollectionEntry, Observation, Trip } from "./api";

type AlbumSnap = { trip: Trip; observations: Observation[] };
type CollectionSnap = {
  entryCount: number;
  petCount?: number;
  kingdomCount?: number;
  entries?: CollectionEntry[];
  petEntries?: PetCollectionEntry[];
};

const albums = new Map<string, AlbumSnap>();
const observations = new Map<string, Observation>();
let collection: CollectionSnap | null = null;

function rememberObservations(list: Observation[]) {
  for (const obs of list) observations.set(obs.id, obs);
}

export function rememberAlbum(id: string, snap: AlbumSnap) {
  albums.set(id, snap);
  rememberObservations(snap.observations);
}

export function peekAlbum(id: string): AlbumSnap | null {
  return albums.get(id) ?? null;
}

export function rememberObservation(obs: Observation) {
  observations.set(obs.id, obs);
}

export function peekObservation(id: string): Observation | null {
  return observations.get(id) ?? null;
}

export function rememberCollection(snap: CollectionSnap) {
  collection = snap;
}

export function peekCollection(): CollectionSnap | null {
  return collection;
}
