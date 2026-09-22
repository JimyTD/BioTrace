export type ReelEntry = { rowKey: string };
export type ReelBookmark = { key: string; fraction: number; paused: boolean };

export function wrapIndex(index: number, length: number): number {
  return length > 0 ? ((index % length) + length) % length : 0;
}

export function reelWindow(position: number, length: number, width: number, step: number) {
  if (!length || step <= 0) return [];
  const base = Math.floor(position);
  return Array.from({ length: Math.ceil(width / step) + 3 }, (_, slot) => {
    const logical = base + slot - 1;
    return { logical, index: wrapIndex(logical, length), overscan: slot === 0 || slot > Math.ceil(width / step) };
  });
}

export function restoreReel(items: readonly ReelEntry[], stored: string | null) {
  try {
    const bookmark: unknown = JSON.parse(stored ?? "null");
    if (!bookmark || typeof bookmark !== "object") return { position: 0, paused: false };
    const { key, fraction, paused } = bookmark as Partial<ReelBookmark>;
    const index = items.findIndex(item => item.rowKey === key);
    if (index < 0) return { position: 0, paused: paused === true };
    return {
      position: index + (typeof fraction === "number" && Number.isFinite(fraction) ? Math.max(0, Math.min(.999999, fraction)) : 0),
      paused: paused === true,
    };
  } catch {
    return { position: 0, paused: false };
  }
}

export function bookmarkReel(items: readonly ReelEntry[], position: number, paused: boolean): ReelBookmark | null {
  if (!items.length || !Number.isFinite(position)) return null;
  const base = Math.floor(position);
  return { key: items[wrapIndex(base, items.length)]!.rowKey, fraction: position - base, paused };
}

/** Keep the same entry in view when a background refresh inserts or reorders rows. */
export function reconcileReelPosition(previous: readonly ReelEntry[], items: readonly ReelEntry[], position: number): number {
  if (!items.length || !previous.length || !Number.isFinite(position)) return 0;
  const base = Math.floor(position);
  const key = previous[wrapIndex(base, previous.length)]!.rowKey;
  const found = items.findIndex(item => item.rowKey === key);
  const index = found >= 0 ? found : wrapIndex(base, items.length);
  return Math.floor(position / previous.length) * items.length + index + position - base;
}

export function collectionReelStorageKey(userId: string): string {
  return `bt_collection_reel_v1:user:${userId}`;
}
