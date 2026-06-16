import { createContext, useState } from "react";

export interface PubChemPreferencesState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const STORAGE_KEY = "bchemxtract-pubchem-enabled";

// Exported so the usePubChemPreferences hook can subscribe. Co-located with
// the provider; the hook lives in its own file to preserve the Fast-Refresh
// component boundary.
// eslint-disable-next-line react-refresh/only-export-components
export const PubChemPreferencesContext = createContext<PubChemPreferencesState>({
  enabled: false,
  setEnabled: () => null,
});

export function PubChemPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === "true",
  );

  const value: PubChemPreferencesState = {
    enabled,
    setEnabled: (next: boolean) => {
      localStorage.setItem(STORAGE_KEY, String(next));
      setEnabledState(next);
    },
  };

  return (
    <PubChemPreferencesContext.Provider value={value}>
      {children}
    </PubChemPreferencesContext.Provider>
  );
}
