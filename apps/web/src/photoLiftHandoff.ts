import type { Location } from "react-router-dom";
import type { MotionBox } from "./motion";

export type PhotoLiftDir = "open" | "close";

export type PhotoLiftOrigin =
  | { kind: "album"; tripId: string }
  | { kind: "volume"; volumeId: string };

export type PhotoLiftHandoff = {
  observationId: string;
  photoUrl: string;
  box: MotionBox;
  dir: PhotoLiftDir;
  origin: PhotoLiftOrigin;
  at?: number;
};

const STORAGE_KEY = "bt_photo_lift";
const FRESH_MS = 8000;

let current: PhotoLiftHandoff | null = null;

function writeStore(handoff: PhotoLiftHandoff | null) {
  try {
    if (handoff) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

function readStore(): PhotoLiftHandoff | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PhotoLiftHandoff;
  } catch {
    return null;
  }
}

function isFresh(handoff: PhotoLiftHandoff) {
  if (!handoff.at) return true;
  return Date.now() - handoff.at < FRESH_MS;
}

export function setPhotoLiftHandoff(handoff: PhotoLiftHandoff) {
  current = { ...handoff, at: Date.now() };
  writeStore(current);
}

export function peekPhotoLiftHandoff(): PhotoLiftHandoff | null {
  const found = current ?? readStore();
  if (!found || !isFresh(found)) return null;
  return found;
}

export function clearPhotoLiftHandoff() {
  current = null;
  writeStore(null);
}

export function photoLiftReturnPath(origin: PhotoLiftOrigin) {
  return origin.kind === "volume"
    ? `/collection/volumes/${origin.volumeId}`
    : `/trips/${origin.tripId}`;
}

export function liftBackgroundState(location: Location) {
  return { background: location };
}

export function peekLiftBackground(location: Location): Location | undefined {
  const state = location.state as { background?: Location } | null;
  return state?.background;
}
