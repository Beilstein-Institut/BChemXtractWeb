/**
 * StatCard formatting helpers — extracted from StatCard.tsx so the
 * component file only exports components (react-refresh/only-export-
 * components). Tests import this directly.
 */

export type StatCardFormat = "count" | "duration" | "percent";

/** Format a numeric value for display on a bento stat tile. Pure. */
export function formatStatValue(value: number, format: StatCardFormat = "count"): string {
  if (!Number.isFinite(value)) return "—";
  switch (format) {
    case "duration": {
      // Duration input is milliseconds.
      if (value < 1000) return `${Math.round(value)} ms`;
      if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
      const totalSeconds = Math.round(value / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
    }
    case "percent":
      return `${value.toFixed(0)}%`;
    case "count":
    default:
      return value.toLocaleString();
  }
}
