// Resolve the theme before first paint so the boot splash (and the app) pick
// the right light/dark colors with no flash. Mirrors theme-provider: storageKey
// "bchemxtract-theme", "system" default resolved via the prefers-color-scheme
// media query.
//
// This lives as an external same-origin file (not an inline <script>) so it
// satisfies the production CSP `script-src 'self'` (see nginx/frontend.conf)
// without needing 'unsafe-inline', a content hash, or a per-request nonce.
// It is loaded synchronously in <head>, so it still runs before the body
// paints — no flash of the wrong theme.
(function () {
  try {
    var t = localStorage.getItem("bchemxtract-theme") || "system";
    var dark =
      t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.add(dark ? "dark" : "light");
  } catch (e) {
    /* localStorage blocked (private mode) — fall through to light. */
  }
})();
