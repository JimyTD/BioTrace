import type { Observation, Trip, VolumeListItem } from "./api";

type AlbumSnap = { trip: Trip; observations: Observation[] };
type CollectionSnap = { entryCount: number; volumes: VolumeListItem[] };

const albums = new Map<string, AlbumSnap>();
const observations = new Map<string, Observation>();
const volumes = new Map<string, VolumeListItem>();
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
  for (const volume of snap.volumes) volumes.set(volume.id, volume);
}

export function peekCollection(): CollectionSnap | null {
  return collection;
}

export function rememberVolume(volume: VolumeListItem) {
  volumes.set(volume.id, volume);
}

export function peekVolume(id: string): VolumeListItem | null {
  return volumes.get(id) ?? null;
}
