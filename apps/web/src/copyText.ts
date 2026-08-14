import { Capacitor } from "@capacitor/core";

export type CopyTextResult = "copied" | "shared" | "failed";

function preferSyncCopyFirst(): boolean {
  if (typeof window === "undefined") return true;
  // Capacitor Android loads remote HTTP: Clipboard API often exists but rejects async,
  // burning the user-gesture before execCommand can run.
  if (document.documentElement.dataset.webview === "android") return true;
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* ignore */
  }
  if (!window.isSecureContext) return true;
  return false;
}

function copyViaExecCommand(
  value: string,
  selectEl?: HTMLInputElement | HTMLTextAreaElement | null,
): boolean {
  if (selectEl) {
    try {
      selectEl.focus({ preventScroll: true });
      selectEl.select();
      selectEl.setSelectionRange(0, value.length);
      if (document.execCommand("copy")) return true;
    } catch {
      /* fall through */
    }
  }

  // Android WebView prefers <input> over hidden <textarea>.
  const input = document.createElement("input");
  input.value = value;
  input.setAttribute("readonly", "");
  input.setAttribute("inputmode", "none");
  input.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;outline:none;opacity:0;";
  document.body.appendChild(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(input);
  }
}

async function copyViaCapacitorClipboard(value: string): Promise<boolean> {
  try {
    if (!Capacitor.isNativePlatform()) return false;
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: value });
    return true;
  } catch {
    return false;
  }
}

async function shareViaNavigator(value: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  try {
    await navigator.share({ text: value });
    return true;
  } catch {
    // User cancel or unsupported — treat as failure.
    return false;
  }
}

/**
 * Copy plain text. On Android / insecure WebViews, sync execCommand runs first
 * so the click gesture is not burned by a rejecting Clipboard API promise.
 */
export async function copyText(
  text: string,
  opts?: { selectEl?: HTMLInputElement | HTMLTextAreaElement | null },
): Promise<CopyTextResult> {
  const value = text.trim();
  if (!value) return "failed";

  const syncFirst = preferSyncCopyFirst();

  if (syncFirst && copyViaExecCommand(value, opts?.selectEl)) return "copied";
  if (await copyViaCapacitorClipboard(value)) return "copied";

  if (!syncFirst && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return "copied";
    } catch {
      /* fall through */
    }
  }

  if (!syncFirst && copyViaExecCommand(value, opts?.selectEl)) return "copied";
  if (await shareViaNavigator(value)) return "shared";
  return "failed";
}
