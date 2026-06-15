/**
 * Client-side string hardening helpers.
 *
 * All four exports are thin slug/sanitise utilities that take untrusted
 * backend strings (filenames, InChI prefixes, clipboard values, URL
 * parameters) and return a form safe for the specific downstream sink:
 *
 *  - {@link safeDisplayFilename}: render a filename as JSX text children
 *    without control characters that would confuse screen readers or
 *    break out of tooltip / aria-label contexts.
 *  - {@link safeDownloadSlug}: produce the base used in `<a download="...">`
 *    so a malformed server value cannot land weird characters in the
 *    suggested filename on disk.
 *  - {@link safeClipboardText}: strip CR/LF/NUL from user-triggered
 *    clipboard writes so pasting the result into a shell or another app
 *    can't silently execute an injected line.
 *  - {@link safePositiveInt}: clamp an unknown value to a positive integer
 *    for URL params and backend-supplied IDs.
 */

// Strips every ASCII control character except tab (0x09). CR + LF are
// stripped because they'd confuse screen readers, CSV export parsers,
// and terminal paste targets.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000A-\u001F\u007F]/g;
const SLUG_RE = /[^A-Za-z0-9_-]+/g;
// eslint-disable-next-line no-control-regex
const CLIPBOARD_RE = /[\r\n\u0000]/g;

export const MAX_DISPLAY_FILENAME_LEN = 255;
export const MAX_DOWNLOAD_SLUG_LEN = 32;

/**
 * Render-safe filename string.
 *
 * Strips ASCII control characters (except tab, which many filenames
 * already contain) and truncates to 255 characters. React auto-escapes
 * text children, so the primary concern here is screen-reader /
 * tooltip confusion rather than HTML escaping.
 */
export function safeDisplayFilename(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(CONTROL_CHARS_RE, "").slice(0, MAX_DISPLAY_FILENAME_LEN);
}

/**
 * Allowlist-based slug for `<a download="...">` attributes.
 *
 * Browsers already sanitise `download` aggressively (stripping path
 * separators, normalising NUL), but this guarantees a deterministic
 * [A-Za-z0-9_-] prefix so a malformed InChI key from the backend can
 * never produce an empty or odd suggested filename.
 */
export function safeDownloadSlug(raw: string | null | undefined, fallback = "structure"): string {
  if (!raw) return fallback;
  const cleaned = raw.replace(SLUG_RE, "_").replace(/^_+|_+$/g, "");
  return (cleaned || fallback).slice(0, MAX_DOWNLOAD_SLUG_LEN);
}

/**
 * Newline- and NUL-stripped clipboard payload.
 *
 * Clipboard writes are user-triggered, but the content comes from
 * backend-extracted strings (SMILES, InChI, abbreviations). If a later
 * paste target interprets CR/LF as a line terminator, an attacker-crafted
 * ChemDraw file could trivially embed a second "line" that runs as a
 * shell command. Stripping them removes that chain.
 */
export function safeClipboardText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(CLIPBOARD_RE, "");
}

/**
 * Clamp/validate an unknown value to a positive integer. Returns the
 * supplied ``fallback`` when the input isn't a finite positive integer
 * inside ``[1, max]``. Useful for URL params and backend-supplied IDs.
 */
export function safePositiveInt(
  value: unknown,
  { fallback = 1, max = Number.MAX_SAFE_INTEGER }: { fallback?: number; max?: number } = {},
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}
