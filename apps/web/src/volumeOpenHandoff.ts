import type { MotionBox } from "./motion";

export type VolumeOpenDir = "open" | "close";

export type VolumeOpenHandoff = {
  volumeId: string;
  coverUrl: string;
  box: MotionBox;
  dir: VolumeOpenDir;
  at?: number;
};

const STORAGE_KEY = "bt_volume_open";
const FRESH_MS = 8000;

let current: VolumeOpenHandoff | null = null;

function writeStore(handoff: VolumeOpenHandoff | null) {
  try {
    if (handoff) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

function readStore(): VolumeOpenHandoff | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VolumeOpenHandoff;
  } catch {
    return null;
  }
}

function isFresh(handoff: VolumeOpenHandoff) {
  if (!handoff.at) return true;
  return Date.now() - handoff.at < FRESH_MS;
}

export function setVolumeOpenHandoff(handoff: VolumeOpenHandoff) {
  current = { ...handoff, at: Date.now() };
  writeStore(current);
}

export function peekVolumeOpenHandoff(): VolumeOpenHandoff | null {
  const found = current ?? readStore();
  if (!found || !isFresh(found)) return null;
  return found;
}

export function clearVolumeOpenHandoff() {
  current = null;
  writeStore(null);
}
