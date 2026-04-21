import { createContext, useContext, useEffect, useState } from "react";
import { resolveHcMode } from "@/lib/hcMode";
import { resolveUiMode, type UiMode } from "@/lib/uiMode";

type Theme = "dark" | "light" | "system";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  uiMode: UiMode;
  hcMode: boolean;
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  uiMode: "legacy",
  hcMode: false,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "bchemxtract-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );
  const [uiMode, setUiMode] = useState<UiMode>(() => resolveUiMode());
  const [hcMode, setHcMode] = useState<boolean>(() => resolveHcMode());

  // Existing .dark / .light emission (unchanged behaviour).
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        const root = window.document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(mediaQuery.matches ? "dark" : "light");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  // NEW: .neo-ui / .hc emission, driven by resolver modules.
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle("neo-ui", uiMode === "neo");
  }, [uiMode]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle("hc", hcMode);
  }, [hcMode]);

  // Re-resolve on route/popstate so ?ui=neo / ?hc=on flags take
  // effect when the URL changes without a full page reload.
  useEffect(() => {
    const sync = () => {
      setUiMode(resolveUiMode());
      setHcMode(resolveHcMode());
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("routechange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("routechange", sync);
    };
  }, []);

  const value: ThemeProviderState = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    uiMode,
    hcMode,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
