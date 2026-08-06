/**
 * Deployment base-path primitives.
 *
 * Production sits behind a reverse proxy that serves the app below the origin
 * root (e.g. https://host/bchemxtract), so a root-absolute URL like
 * `/assets/index.js` or `/api/extract` escapes the proxied prefix and never
 * reaches the app. Vite bakes the prefix into `import.meta.env.BASE_URL` at
 * build time (from `VITE_BASE_PATH`); everything else in the app writes URLs
 * root-relative and routes them through here.
 *
 * `BASE_URL` is "/" for dev, tests, and root deployments, which makes every
 * helper below an identity function.
 *
 * Leaf module on purpose — no React import — so `apiClient` can use it without
 * pulling in the router.
 */

/** The base path without its trailing slash: "" at the origin root. */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Prefix a root-relative app path (route or `/api/…` URL) with the base path. */
export function withBase(path: string): string {
  return BASE + path;
}

/**
 * Strip the base path off a browser pathname, yielding the root-relative route
 * the app matches on. Both "/base" and "/base/" report "/".
 */
export function stripBase(pathname: string): string {
  const path = BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  return path || "/";
}

/**
 * Resolve a `public/` asset (logos, fonts) against the base path. Takes the
 * path with or without a leading slash.
 */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}
