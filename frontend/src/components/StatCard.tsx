/**
 * StatCard — bento stat tile for the Phase 3 Liquid Glass rebuild (Task 12).
 *
 * A single metric tile with:
 *   - Fraunces display numeral (Satoshi in the source plan — resolved to
 *     Fraunces because Satoshi is unavailable on npm; `font-display`).
 *   - Inter caption label rendered above the numeral.
 *   - Optional trend indicator (`↑ +12%`, `↓ 3%`).
 *   - Optional icon in the top-right, tinted to match the tone.
 *   - Tone variants: `primary` (crimson numeral), `secondary` (teal
 *     numeral), `neutral` (foreground).
 *   - Format hints: `count` (`toLocaleString`), `duration`
 *     (ms → `1.2s` / `2m 30s`), `percent`.
 *
 * Still supports the Phase 2 use case: passing a pre-formatted string
 * value (e.g. `"C6H12O6"`). String values skip the formatter entirely.
 * An empty-string / null / undefined value renders an em-dash so the
 * tile height stays consistent.
 *
 * `loading` renders a Skeleton at the tile height; preserved from the
 * Phase 2 API because HistoryPage passes it while stats are in-flight.
 *
 * Data hooks: `data-slot="stat-card"`, `data-tone`, `data-slot="stat-card-value"`.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatStatValue, type StatCardFormat } from "./statCardFormat";

export type StatCardTone = "primary" | "secondary" | "neutral";
export type { StatCardFormat };

export interface StatCardTrend {
  direction: "up" | "down";
  /** Pre-formatted label (e.g. `"+12%"`). */
  value: string;
}

export interface StatCardProps {
  label: string;
  /** Number (formatted per `format`) or pre-formatted string. */
  value: number | string;
  /** Numeric formatting — ignored when `value` is a string. */
  format?: StatCardFormat;
  tone?: StatCardTone;
  trend?: StatCardTrend;
  icon?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

/**
 * Bento stat tile. Supports both the Phase 3 tone/trend API and the
 * legacy `string` value path from Phase 2.
 */
export function StatCard({
  label,
  value,
  format = "count",
  tone = "neutral",
  trend,
  icon,
  loading = false,
  className,
}: StatCardProps) {
  if (loading) {
    return (
      <Skeleton
        data-slot="stat-card"
        data-loading="true"
        className={cn("h-[128px] w-full rounded-lg", className)}
      />
    );
  }

  const isEmpty =
    value === "" || value === null || value === undefined;
  const displayValue = isEmpty
    ? "—"
    : typeof value === "number"
      ? formatStatValue(value, format)
      : value;

  const numeralToneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "secondary"
        ? "text-secondary"
        : "text-foreground";

  const iconToneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "secondary"
        ? "text-secondary"
        : "text-foreground-muted";

  return (
    <div
      data-slot="stat-card"
      data-tone={tone}
      className={cn(
        "flex h-full flex-col justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-4",
        "transition-colors",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-caption font-medium uppercase tracking-wide text-foreground-muted">
          {label}
        </span>
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-5 items-center justify-center [&_svg]:size-5",
              iconToneClass,
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span
          data-slot="stat-card-value"
          className={cn(
            "font-display text-4xl font-semibold leading-none tabular-nums",
            numeralToneClass,
          )}
        >
          {displayValue}
        </span>
        {trend && (
          <span
            data-slot="stat-card-trend"
            data-direction={trend.direction}
            className={cn(
              "text-caption font-medium tabular-nums",
              trend.direction === "up" ? "text-secondary" : "text-destructive",
            )}
          >
            {trend.direction === "up" ? "↑" : "↓"} {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
