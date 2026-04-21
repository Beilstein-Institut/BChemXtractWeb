/**
 * ChemistryThemeSwitch — chemistry-themed light/dark mode toggle.
 *
 * A glass round-bottom flask with liquid inside slides across the track:
 * day side shows a sun and clouds (teal liquid); night side shows a moon
 * with craters over a sky of stars (navy liquid). Active-click tips the
 * neck 18° as a "pour" micro-interaction.
 *
 * Design ported from Kohulan/ChemAudit's ChemThemeToggle. Styled-components
 * was replaced with plain CSS scoped under `.chem-toggle` in
 * `src/index.css`; the theme wire-up uses the existing ThemeProvider at
 * `src/components/theme-provider.tsx`. When `theme === "system"` the
 * toggle mirrors the current OS preference via `matchMedia`.
 */
import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";

/** Live system-dark preference, SSR-safe and re-subscribed across mounts. */
function useSystemDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false,
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handle = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener("change", handle);
    return () => mql.removeEventListener("change", handle);
  }, []);
  return isDark;
}

export function ChemistryThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const systemDark = useSystemDark();
  const isDark = theme === "dark" || (theme === "system" && systemDark);

  return (
    <label
      className="chem-toggle"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <input
        type="checkbox"
        role="switch"
        className="chem-toggle__checkbox"
        checked={isDark}
        aria-checked={isDark}
        onChange={(e) => setTheme(e.target.checked ? "dark" : "light")}
      />
      <div className="chem-toggle__container">
        <div className="chem-toggle__scenery" aria-hidden>
          {/* 7 stars — positioning/transitions keyed on :nth-child(1..7) */}
          <div className="chem-toggle__star" />
          <div className="chem-toggle__star" />
          <div className="chem-toggle__star" />
          <div className="chem-toggle__star" />
          <div className="chem-toggle__star" />
          <div className="chem-toggle__star" />
          <div className="chem-toggle__star" />
          <div className="sun-primary" />
          <div className="sun-secondary" />
          <div className="moon" />
          <div className="moon-crater-1" />
          <div className="moon-crater-2" />
          {/* 3 clouds — styled via :nth-last-child(1..3) */}
          <div className="chem-toggle__cloud" />
          <div className="chem-toggle__cloud" />
          <div className="chem-toggle__cloud" />
        </div>
        <div className="flask" aria-hidden>
          <div className="flask__neck-container">
            <div className="flask__vapor" />
            <div className="flask__vapor" />
            <div className="flask__neck" />
          </div>
          <div className="flask__body" />
        </div>
        <div className="artificial__hidden" aria-hidden>
          <div className="flask__shadow" />
        </div>
      </div>
    </label>
  );
}
