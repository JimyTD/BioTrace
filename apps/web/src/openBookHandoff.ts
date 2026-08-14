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

let current: OpenBookHandoff | null = null;

export function setOpenBookHandoff(handoff: OpenBookHandoff) {
  current = handoff;
}

export function takeOpenBookHandoff(tripId: string): OpenBookHandoff | null {
  if (!current || current.tripId !== tripId) return null;
  const taken = current;
  current = null;
  return taken;
}

export function captureCoverBox(el: HTMLElement): OpenBookBox {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
