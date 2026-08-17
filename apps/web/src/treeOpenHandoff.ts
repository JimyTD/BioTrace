import type { MotionBox } from "./motion";

export type TreeOpenHandoff = {
  destPath: string[];
  plateLatin: string;
  coverUrl: string;
  box: MotionBox;
  dir: "open" | "close";
  at?: number;
};

const STORAGE_KEY = "bt_tree_open";
const FRESH_MS = 8000;

let current: TreeOpenHandoff | null = null;

function writeStore(handoff: TreeOpenHandoff | null) {
  try {
    if (handoff) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

function readStore(): TreeOpenHandoff | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TreeOpenHandoff;
  } catch {
    return null;
  }
}

function isFresh(handoff: TreeOpenHandoff) {
  if (!handoff.at) return true;
  return Date.now() - handoff.at < FRESH_MS;
}

export function setTreeOpenHandoff(handoff: TreeOpenHandoff) {
  current = { ...handoff, at: Date.now() };
  writeStore(current);
}

export function peekTreeOpenHandoff(): TreeOpenHandoff | null {
  const found = current ?? readStore();
  if (!found || !isFresh(found)) return null;
  return found;
}

export function clearTreeOpenHandoff() {
  current = null;
  writeStore(null);
}
