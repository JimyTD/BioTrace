import { Capacitor } from "@capacitor/core";

export type CopyTextResult = "copied" | "shared" | "failed";

function isAndroidShell(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.webview === "android") {
    return true;
  }
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function hasNativeClipboardPlugin(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Clipboard");
  } catch {
    return false;
  }
}

/** True when the invite button should label itself as share (no silent clipboard). */
export function androidInviteUsesShare(): boolean {
  return isAndroidShell() && !hasNativeClipboardPlugin();
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
  if (!hasNativeClipboardPlugin()) return false;
  try {
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
    return false;
  }
}

/**
 * Capacitor Android + remote HTTP cannot reliably silent-copy via browser APIs.
 * - APK with @capacitor/clipboard → native write
 * - Current APK without plugin → Web Share (must run before any other await)
 * - Do NOT trust execCommand on Android: it may return true without writing clipboard
 */
export async function copyText(
  text: string,
  opts?: { selectEl?: HTMLInputElement | HTMLTextAreaElement | null },
): Promise<CopyTextResult> {
  const value = text.trim();
  if (!value) return "failed";

  const android = isAndroidShell();

  if (hasNativeClipboardPlugin()) {
    if (await copyViaCapacitorClipboard(value)) return "copied";
  }

  // Existing Android APK: share immediately while click gesture is alive.
  if (android) {
    if (await shareViaNavigator(value)) return "shared";
    return "failed";
  }

  if (typeof window !== "undefined" && window.isSecureContext) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return "copied";
      } catch {
        /* fall through */
      }
    }
  }

  if (copyViaExecCommand(value, opts?.selectEl)) return "copied";
  if (await shareViaNavigator(value)) return "shared";
  return "failed";
}
