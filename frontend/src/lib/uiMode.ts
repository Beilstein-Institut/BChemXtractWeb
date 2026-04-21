/**
 * UI mode resolver — decides whether the neomorphism theme (`.neo-ui`
 * class on <html>) should be active. URL flag (?ui=neo / ?ui=legacy)
 * always wins over localStorage; localStorage provides persistence
 * across navigation. Default is "legacy" during the 5-phase rollout.
 *
 * See docs/superpowers/specs/2026-04-21-neomorphism-revamp-design.md §2.
 */

export type UiMode = "neo" | "legacy";

export const UI_MODE_URL_PARAM = "ui";
export const UI_MODE_STORAGE_KEY = "bchemxtract-ui-mode";

function isUiMode(value: string | null): value is UiMode {
  return value === "neo" || value === "legacy";
}

export function readUiModeFromUrl(): UiMode | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(UI_MODE_URL_PARAM);
  return isUiMode(value) ? value : null;
}

export function getStoredUiMode(): UiMode | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
  return isUiMode(value) ? value : null;
}

export function setStoredUiMode(mode: UiMode | null): void {
  if (typeof window === "undefined") return;
  if (mode === null) {
    window.localStorage.removeItem(UI_MODE_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
}

export function resolveUiMode(): UiMode {
  return readUiModeFromUrl() ?? getStoredUiMode() ?? "legacy";
}
