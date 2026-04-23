/**
 * `isRouteActive` — shared route-active predicate used by both the
 * desktop `NavLinks` pill and the mobile `AppHeader` sheet menu.
 *
 * Treats `/` as an exact match and every other route as an exact match
 * OR a prefix match followed by a `/` — so `/browse` stays active while
 * the user is on `/browse/1234`, but `/browsing` never would.
 *
 * Kept in a standalone module (rather than exported from `NavLinks.tsx`)
 * so the component file satisfies `react-refresh/only-export-components`.
 */
export function isRouteActive(route: string, to: string): boolean {
  if (to === "/") return route === "/";
  return route === to || route.startsWith(`${to}/`);
}
