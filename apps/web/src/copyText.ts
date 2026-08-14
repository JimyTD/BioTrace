import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";

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

/**
 * Copy plain text to the system clipboard.
 * Native Capacitor shell → @capacitor/clipboard（需带该插件的 APK）.
 * Browser → Clipboard API，必要时回退 execCommand.
 */
export async function copyText(
  text: string,
  opts?: { selectEl?: HTMLInputElement | HTMLTextAreaElement | null },
): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;

  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: value });
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* fall through */
    }
  }

  return copyViaExecCommand(value, opts?.selectEl);
}
