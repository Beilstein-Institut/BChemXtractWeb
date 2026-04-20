/**
 * Lightweight pathname router (utilities).
 *
 * `<Link>` component lives in ./Link.tsx so this module can stay
 * component-free and satisfy react-refresh/only-export-components.
 */
import { useEffect, useState } from "react";

export const ROUTE_CHANGE_EVENT = "routechange";

function currentPath(): string {
  return window.location.pathname || "/";
}

export function navigate(to: string): void {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", to);
  window.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT));
}

/**
 * useRoute — subscribe to pathname changes. Returns the current pathname,
 * normalised so a missing pathname reports "/".
 */
export function useRoute(): string {
  const [path, setPath] = useState<string>(() => currentPath());

  useEffect(() => {
    function sync() {
      setPath(currentPath());
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
