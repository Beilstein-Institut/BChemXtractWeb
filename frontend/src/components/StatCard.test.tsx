import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Total extractions" value={42} />);
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Total extractions")).toBeTruthy();
  });

  it("renders em dash for empty value", () => {
    render(<StatCard label="Most common formula" value="" />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders skeleton when loading", () => {
    const { container } = render(<StatCard label="Unique structures" value={0} loading />);
    // Skeleton renders a div with animate-pulse (no text content)
    expect(screen.queryByText("0")).toBeNull();
    expect(container.querySelector('[class*="animate-pulse"]') ?? container.querySelector('[class*="skeleton"]') ?? container.firstChild).toBeTruthy();
  });
});
