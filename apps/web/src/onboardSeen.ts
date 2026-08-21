const STORAGE_PREFIX = "bt_onboard_seen_v1:";

function key(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function hasOnboardSeen(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === "1";
  } catch {
    return false;
  }
}

export function markOnboardSeen(userId: string): void {
  try {
    localStorage.setItem(key(userId), "1");
  } catch {
    /* private mode */
  }
}
