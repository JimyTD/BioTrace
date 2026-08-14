export type OpenBookBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type OpenBookHandoff = {
  tripId: string;
  coverUrl: string | null;
  source: OpenBookBox;
  at?: number;
};

const STORAGE_KEY = "bt_open_book";
const FRESH_MS = 8000;

let current: OpenBookHandoff | null = null;

function writeStore(handoff: OpenBookHandoff | null) {
  try {
    if (handoff) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

function readStore(): OpenBookHandoff | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OpenBookHandoff;
  } catch {
    return null;
  }
}

function isFresh(handoff: OpenBookHandoff) {
  if (!handoff.at) return true;
  return Date.now() - handoff.at < FRESH_MS;
}

export function setOpenBookHandoff(handoff: OpenBookHandoff) {
  current = { ...handoff, at: Date.now() };
  writeStore(current);
}

export function peekOpenBookHandoff(tripId: string): OpenBookHandoff | null {
  const found = current ?? readStore();
  if (!found || found.tripId !== tripId || !isFresh(found)) return null;
  return found;
}

export function clearOpenBookHandoff() {
  current = null;
  writeStore(null);
}

export function captureCoverBox(el: HTMLElement): OpenBookBox {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
