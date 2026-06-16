import { useContext } from "react";
import { PubChemPreferencesContext } from "@/context/PubChemPreferencesContext";

/** Read/write the app-wide PubChem opt-in (persisted to localStorage). */
export function usePubChemPreferences() {
  return useContext(PubChemPreferencesContext);
}
