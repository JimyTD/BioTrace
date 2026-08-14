const STORAGE_KEY = "bt_scroll_mem";

let memory: Record<string, number> = {};

function readAll(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...memory };
    return { ...JSON.parse(raw), ...memory };
  } catch {
    return { ...memory };
  }
}

function writeAll(next: Record<string, number>) {
  memory = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function saveScroll(key: string, top: number) {
  writeAll({ ...readAll(), [key]: top });
}

export function peekScroll(key: string): number | null {
  const found = readAll()[key];
  return typeof found === "number" ? found : null;
}

function asElement(node: Element | null): HTMLElement | null {
  return node instanceof HTMLElement ? node : null;
}

export function saveAlbumScroll(tripId: string) {
  const pages = asElement(document.querySelector(".trip-book-pages"));
  if (pages) saveScroll(`album:${tripId}`, pages.scrollTop);
}

export function restoreAlbumScroll(tripId: string) {
  const pages = asElement(document.querySelector(".trip-book-pages"));
  const top = peekScroll(`album:${tripId}`);
  if (pages && top != null) pages.scrollTop = top;
}

export function saveContentScroll(key: string) {
  const main = asElement(document.querySelector("main.content"));
  if (main) saveScroll(key, main.scrollTop);
}

export function restoreContentScroll(key: string) {
  const main = asElement(document.querySelector("main.content"));
  const top = peekScroll(key);
  if (main && top != null) main.scrollTop = top;
}
