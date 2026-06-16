import { createContext, useEffect, useState } from "react";
import { getPubChemStatus } from "@/lib/apiClient";

export interface PubChemPreferencesState {
  /** The user's opt-in (persisted to localStorage). */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /**
   * Whether the SERVER has PubChem enrichment enabled (PUBCHEM_ENABLED). When
   * false the feature is hidden and no lookups are fired — so the UI never
   * calls an endpoint that would 503. Defaults false until the status fetch
   * resolves (fail-closed).
   */
  available: boolean;
}

const STORAGE_KEY = "bchemxtract-pubchem-enabled";

// Exported so the usePubChemPreferences hook can subscribe. Co-located with
// the provider; the hook lives in its own file to preserve the Fast-Refresh
// component boundary.
// eslint-disable-next-line react-refresh/only-export-components
export const PubChemPreferencesContext = createContext<PubChemPreferencesState>({
  enabled: false,
  setEnabled: () => null,
  available: false,
});

export function PubChemPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === "true",
  );
  const [available, setAvailable] = useState<boolean>(false);

  // Ask the server once whether the feature flag is on. Fail-closed: any error
  // leaves `available` false, so the feature stays hidden and no lookups fire.
  useEffect(() => {
    let cancelled = false;
    getPubChemStatus()
      .then((s) => {
        if (!cancelled) setAvailable(s.enabled);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value: PubChemPreferencesState = {
    enabled,
    setEnabled: (next: boolean) => {
      localStorage.setItem(STORAGE_KEY, String(next));
      setEnabledState(next);
    },
    available,
  };

  return (
    <PubChemPreferencesContext.Provider value={value}>
      {children}
    </PubChemPreferencesContext.Provider>
  );
}
