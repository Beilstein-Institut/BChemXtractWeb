/**
 * High-Contrast mode resolver — decides whether the `.hc` class
 * should be on <html>. URL (?hc=on / ?hc=off) wins over
 * localStorage.bchemxtract-hc. Default off during rollout.
 *
 * Only meaningful in combination with .neo-ui; the HC overrides
 * flatten neomorphism shadows into AA-compliant borders.
 */

export const HC_MODE_URL_PARAM = "hc";
export const HC_MODE_STORAGE_KEY = "bchemxtract-hc";

type StoredHc = "on" | "off";

function parseStored(value: string | null): boolean | null {
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

export function readHcModeFromUrl(): boolean | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return parseStored(params.get(HC_MODE_URL_PARAM));
}

export function getStoredHcMode(): boolean | null {
  if (typeof window === "undefined") return null;
  return parseStored(window.localStorage.getItem(HC_MODE_STORAGE_KEY));
}

export function setStoredHcMode(on: boolean | null): void {
  if (typeof window === "undefined") return;
  if (on === null) {
    window.localStorage.removeItem(HC_MODE_STORAGE_KEY);
    return;
  }
  const serialized: StoredHc = on ? "on" : "off";
  window.localStorage.setItem(HC_MODE_STORAGE_KEY, serialized);
}

export function resolveHcMode(): boolean {
  return readHcModeFromUrl() ?? getStoredHcMode() ?? false;
}
