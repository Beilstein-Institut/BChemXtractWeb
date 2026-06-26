/**
 * copyText — copy text to the clipboard, with a non-secure-context fallback.
 *
 * `navigator.clipboard` only exists in a secure context (HTTPS or localhost).
 * This app is frequently served over plain HTTP on a LAN IP, where the
 * Clipboard API is `undefined` and the modern path throws — which is why the
 * copy buttons fail with "Couldn't copy" in those deployments. We fall back to
 * the legacy `execCommand("copy")` via an offscreen textarea, which still works
 * over HTTP as long as it runs inside a user gesture (the click handler that
 * calls this).
 *
 * All payloads pass through `safeClipboardText` so CR/LF/NUL control characters
 * never reach the clipboard. Throws if neither path succeeds, so callers keep
 * their existing try/catch + toast behaviour.
 */
import { safeClipboardText } from "@/lib/safeStrings";

function legacyCopy(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  // Keep it off-screen so the page doesn't visibly jump on click.
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy was rejected by the browser.");
    }
  } finally {
    document.body.removeChild(ta);
  }
}

export async function copyText(value: string): Promise<void> {
  const text = safeClipboardText(value);
  // Nothing to copy (empty value, or only stripped control chars): treat as a
  // failure so callers show their "couldn't copy" affordance rather than
  // flashing success while the clipboard silently holds an empty string.
  if (!text) {
    throw new Error("Nothing to copy.");
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Secure-context API present but refused (e.g. NotAllowedError when the
      // document isn't focused) — fall through to the legacy path.
    }
  }
  legacyCopy(text);
}
