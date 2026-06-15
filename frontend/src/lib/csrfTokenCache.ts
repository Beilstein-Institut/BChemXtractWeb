/**
 * Module-level mutable cache for the CSRF token.
 *
 * Populated by `useCsrfToken()` on app mount and on 403/CSRF_INVALID retries
 * by the apiClient. Consumed by `apiFetch` to inject the X-CSRF-Token header
 * on state-changing methods.
 *
 * Rationale: A React Context provider works but is overkill for a single
 * string read inside a non-React module (apiClient.ts). The module-level
 * singleton is read by apiClient synchronously; the hook writes to it on
 * mount + on refresh.
 */
export const csrfTokenCache: { value: string | null } = { value: null };

/** Methods that REQUIRE a CSRF token under cookie auth. */
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function needsCsrf(method: string | undefined): boolean {
  if (!method) return false;
  return STATE_CHANGING.has(method.toUpperCase());
}
