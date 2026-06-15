/**
 * StatCard tests.
 *
 * Covers:
 *   - label + numeric value rendering with default `count` format.
 *   - legacy string value path (pre-formatted values render as-is).
 *   - em-dash fallback for empty / null / undefined values.
 *   - loading state renders the Skeleton without showing the value.
 *   - tone variants (primary / secondary / neutral) apply the right text
 *     class to the numeral.
 *   - trend indicator renders with the right direction glyph + tone.
 *   - icon slot is honoured and tinted per tone.
 *   - formatStatValue: count locale formatting, duration bucket
 *     thresholds (ms → s → m+s), percent formatting, non-finite guard.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatCard } from "./StatCard";
import { formatStatValue } from "./statCardFormat";

describe("StatCard", () => {
  it("renders label and numeric value (count format)", () => {
    render(<StatCard label="Total extractions" value={1234} />);
    expect(screen.getByText("Total extractions")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("renders a string value as-is (legacy path)", () => {
    render(<StatCard label="Most common formula" value="C6H12O6" />);
    expect(screen.getByText("C6H12O6")).toBeInTheDocument();
  });

  it("renders em dash for empty value", () => {
    render(<StatCard label="Most common formula" value="" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders skeleton when loading and hides the value", () => {
    const { container } = render(<StatCard label="Unique structures" value={0} loading />);
    expect(screen.queryByText("0")).toBeNull();
    expect(container.querySelector('[data-slot="stat-card"][data-loading="true"]')).not.toBeNull();
  });

  it("applies the primary tone class to the numeral", () => {
    const { container } = render(<StatCard label="Total" value={12} tone="primary" />);
    const numeral = container.querySelector('[data-slot="stat-card-value"]') as HTMLElement | null;
    expect(numeral).not.toBeNull();
    expect(numeral?.className).toContain("text-primary");
    expect(container.querySelector('[data-slot="stat-card"]')).toHaveAttribute(
      "data-tone",
      "primary",
    );
  });

  it("applies the secondary tone class to the numeral", () => {
    const { container } = render(<StatCard label="Total" value={12} tone="secondary" />);
    const numeral = container.querySelector('[data-slot="stat-card-value"]') as HTMLElement | null;
    expect(numeral?.className).toContain("text-secondary");
  });

  it("defaults to neutral foreground numeral when tone is omitted", () => {
    const { container } = render(<StatCard label="Total" value={12} />);
    const numeral = container.querySelector('[data-slot="stat-card-value"]') as HTMLElement | null;
    expect(numeral?.className).toContain("text-foreground");
  });

  it("renders an up trend with secondary tint", () => {
    render(<StatCard label="Total" value={100} trend={{ direction: "up", value: "+12%" }} />);
    const trend = screen.getByText(/\+12%/);
    expect(trend.textContent).toContain("↑");
    expect(trend.className).toContain("text-secondary");
  });

  it("renders a down trend with destructive tint", () => {
    render(<StatCard label="Total" value={100} trend={{ direction: "down", value: "5%" }} />);
    const trend = screen.getByText(/5%/);
    expect(trend.textContent).toContain("↓");
    expect(trend.className).toContain("text-destructive");
  });

  it("renders the icon slot with tone-tinted wrapper", () => {
    const { container } = render(
      <StatCard label="Total" value={12} tone="secondary" icon={<svg data-testid="stat-icon" />} />,
    );
    const iconWrap = screen.getByTestId("stat-icon").parentElement;
    expect(iconWrap?.className).toContain("text-secondary");
    // The card still exposes the correct data-slot.
    expect(container.querySelector('[data-slot="stat-card"]')).not.toBeNull();
  });
});

describe("formatStatValue", () => {
  it("formats counts with locale separators", () => {
    expect(formatStatValue(0, "count")).toBe("0");
    expect(formatStatValue(1234, "count")).toBe("1,234");
    expect(formatStatValue(1_000_000, "count")).toBe("1,000,000");
  });

  it("formats durations: sub-second → ms", () => {
    expect(formatStatValue(0, "duration")).toBe("0 ms");
    expect(formatStatValue(120.4, "duration")).toBe("120 ms");
    expect(formatStatValue(999, "duration")).toBe("999 ms");
  });

  it("formats durations: sub-minute → seconds with one decimal", () => {
    expect(formatStatValue(1000, "duration")).toBe("1.0 s");
    expect(formatStatValue(59_900, "duration")).toBe("59.9 s");
  });

  it("formats durations: 1 minute+ → 'Nm SSs'", () => {
    expect(formatStatValue(60_000, "duration")).toBe("1m 00s");
    expect(formatStatValue(125_000, "duration")).toBe("2m 05s");
  });

  it("formats percent to zero decimals", () => {
    expect(formatStatValue(12.6, "percent")).toBe("13%");
    expect(formatStatValue(0, "percent")).toBe("0%");
  });

  it("returns em dash for non-finite input", () => {
    expect(formatStatValue(Number.NaN, "count")).toBe("—");
    expect(formatStatValue(Number.POSITIVE_INFINITY, "duration")).toBe("—");
  });
});
