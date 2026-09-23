/**
 * Lightweight pathname router (utilities).
 *
 * `<Link>` component lives in ./Link.tsx so this module can stay
 * component-free and satisfy react-refresh/only-export-components.
 */
import { useEffect, useState } from "react";

import { stripBase, withBase } from "@/lib/basePath";

export const ROUTE_CHANGE_EVENT = "routechange";

/**
 * The current route with the deployment base path removed.
 *
 * Route literals throughout the app (`/extract`, `/browse`, …) are written
 * root-relative, while the browser's pathname carries the proxy's sub-path
 * prefix in production. Translating in this one place keeps every `navigate()`
 * call site and `<Link to>` prefix-unaware.
 */
export function routePath(): string {
  return stripBase(window.location.pathname);
}

/** Routes that host the structure search box. */
const SEARCH_ROUTES = ["/browse", "/history"];

/**
 * Search used to live in the header, so older shared links carry `?q=` on any
 * route (`/?q=…`, `/extract?q=…`). Search now lives on Browse and History only;
 * send such a link to History (which opens in Structures mode for `?q=`) with
 * its query intact, so it still shows results. Call once, before first render.
 */
export function redirectLegacySearchLink(): void {
  if (!new URLSearchParams(window.location.search).has("q")) return;
  if (SEARCH_ROUTES.includes(routePath())) return;
  window.history.replaceState(null, "", withBase("/history") + window.location.search);
}

export function navigate(to: string): void {
  const target = withBase(to);
  if (target === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", target);
  window.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT));
}

/**
 * useRoute — subscribe to pathname changes. Returns the current route with the
 * deployment base path removed, normalised so a missing pathname reports "/".
 */
export function useRoute(): string {
  const [path, setPath] = useState<string>(() => routePath());

  useEffect(() => {
    function sync() {
      setPath(routePath());
    }
    window.addEventListener("popstate", sync);
    window.addEventListener(ROUTE_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(ROUTE_CHANGE_EVENT, sync);
    };
  }, []);

  return path;
}
