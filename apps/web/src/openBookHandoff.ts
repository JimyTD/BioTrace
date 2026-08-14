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
};

const STORAGE_KEY = "bt_open_book";

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

export function setOpenBookHandoff(handoff: OpenBookHandoff) {
  current = handoff;
  writeStore(handoff);
}

export function takeOpenBookHandoff(tripId: string): OpenBookHandoff | null {
  const found = current ?? readStore();
  if (!found || found.tripId !== tripId) return null;
  current = null;
  writeStore(null);
  return found;
}

export function captureCoverBox(el: HTMLElement): OpenBookBox {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
