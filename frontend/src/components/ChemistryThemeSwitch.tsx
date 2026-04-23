/**
 * ChemistryThemeSwitch — claymorphism sky slider with a round-bottom
 * flask as the slider puck.
 *
 * Structure mirrors the canonical "theme-switch" sky-slider:
 *
 *   label.theme-switch
 *     input.theme-switch__checkbox (visually hidden)
 *     div.theme-switch__container
 *       div.theme-switch__clouds            (light-side scenery)
 *       div.theme-switch__stars-container    (dark-side scenery, SVG)
 *       div.theme-switch__circle-container   (the sliding puck)
 *         div.theme-switch__sun-moon-container
 *           svg.theme-switch__flask          (round-bottom flask + liquid)
 *
 * Instead of a sun↔moon, the puck is a round-bottom flask (narrow
 * rectangular neck above a circular glass body) whose liquid
 * transitions teal (light) → navy (dark) via two linear gradients
 * in <defs>. Clicking the label toggles ThemeProvider between
 * `"light"` and `"dark"`. When the provider's theme is `"system"`,
 * `resolvedDark` mirrors the OS preference via
 * `matchMedia("(prefers-color-scheme: dark)")`.
 *
 * Exposes `data-slot="theme-switch"` so AppHeader,
 * phase3-smoke.spec, and visual-overhaul.spec continue to resolve
 * it via `[data-slot="theme-switch"]`.
 *
 * Styling lives under `.theme-switch` in `src/index.css`
 * (claymorphism: vibrant 2-stop sky gradients, multi-layer
 * outer+inner shadows, drop-shadow float on the flask, full 360°
 * swirl on every state flip).
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

/**
 * Starfield — seven small circles laid out across a 144×55 SVG
 * canvas. Matches the scale/density of the reference toggle's
 * starfield without fabricating an external `d=...` path we can't
 * verify. Rendered inside `.theme-switch__stars-container`, which
 * slides into view when the checkbox is :checked.
 */
const STARS: Array<{ cx: number; cy: number; r: number; opacity?: number }> = [
  { cx: 18, cy: 12, r: 1.2 },
  { cx: 36, cy: 22, r: 0.8, opacity: 0.9 },
  { cx: 54, cy: 10, r: 1, opacity: 0.8 },
  { cx: 76, cy: 28, r: 1.4 },
  { cx: 96, cy: 14, r: 0.9, opacity: 0.85 },
  { cx: 116, cy: 22, r: 1.1 },
  { cx: 132, cy: 8, r: 0.7, opacity: 0.7 },
  { cx: 28, cy: 36, r: 0.6, opacity: 0.8 },
  { cx: 64, cy: 42, r: 0.8, opacity: 0.7 },
  { cx: 104, cy: 38, r: 0.7, opacity: 0.75 },
];

export function ChemistryThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const systemDark = useSystemDark();
  const resolvedDark = theme === "dark" || (theme === "system" && systemDark);

  const handleToggle = () => {
    setTheme(resolvedDark ? "light" : "dark");
  };

  return (
    <label
      className="theme-switch"
      data-slot="theme-switch"
      aria-label={resolvedDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      <input
        type="checkbox"
        role="switch"
        className="theme-switch__checkbox"
        checked={resolvedDark}
        aria-checked={resolvedDark}
        onChange={handleToggle}
      />
      <div className="theme-switch__container">
        <div className="theme-switch__clouds" aria-hidden />
        <div className="theme-switch__stars-container" aria-hidden>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 144 55"
            fill="currentColor"
          >
            {STARS.map((s) => (
              <circle
                key={`${s.cx}-${s.cy}`}
                cx={s.cx}
                cy={s.cy}
                r={s.r}
                opacity={s.opacity ?? 1}
              />
            ))}
          </svg>
        </div>
        <div className="theme-switch__circle-container">
          <div className="theme-switch__sun-moon-container">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 40 40"
              className="theme-switch__flask"
              aria-hidden
            >
              <defs>
                <linearGradient
                  id="chem-flask-liquid-light"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#2AA3BC" />
                  <stop offset="100%" stopColor="#096779" />
                </linearGradient>
                <linearGradient
                  id="chem-flask-liquid-dark"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#2B4780" />
                  <stop offset="100%" stopColor="#072563" />
                </linearGradient>
                <clipPath id="chem-flask-body-clip">
                  <circle cx="20" cy="26" r="10" />
                </clipPath>
              </defs>

              {/* Neck — narrow rectangular stem above the round body. */}
              <rect
                className="theme-switch__flask-neck"
                x="18"
                y="5"
                width="4"
                height="12"
                rx="0.8"
              />

              {/* Round body (glass). */}
              <circle
                className="theme-switch__flask-body"
                cx="20"
                cy="26"
                r="10"
              />

              {/* Liquid fill — lower portion of the round body, clipped
                  to the body circle so the top edge appears flat. */}
              <rect
                className="theme-switch__flask-liquid"
                x="10"
                y="24"
                width="20"
                height="14"
                clipPath="url(#chem-flask-body-clip)"
              />

              {/* Neck highlight — slim vertical shine on the neck. */}
              <rect
                className="theme-switch__flask-shine"
                x="18.5"
                y="6"
                width="1"
                height="9"
                rx="0.4"
              />

              {/* Meniscus tint at the liquid surface. */}
              <rect
                className="theme-switch__flask-meniscus"
                x="10"
                y="23.5"
                width="20"
                height="1"
                clipPath="url(#chem-flask-body-clip)"
              />

              {/* Bubbles inside the liquid. */}
              <circle
                className="theme-switch__flask-bubble"
                cx="16"
                cy="30"
                r="0.9"
              />
              <circle
                className="theme-switch__flask-bubble"
                cx="24"
                cy="32"
                r="0.7"
              />
              <circle
                className="theme-switch__flask-bubble"
                cx="20"
                cy="28"
                r="0.5"
              />
            </svg>
          </div>
        </div>
      </div>
    </label>
  );
}
