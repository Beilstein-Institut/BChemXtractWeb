/**
 * useTheme — consume the ThemeProvider context.
 *
 * Separated from theme-provider.tsx so that file only exports a React
 * component; React Fast Refresh requires that boundary to keep HMR
 * stable (react-refresh/only-export-components).
 */
import { useContext } from "react";

import { ThemeProviderContext, type ThemeProviderState } from "@/components/theme-provider";

export function useTheme(): ThemeProviderState {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
