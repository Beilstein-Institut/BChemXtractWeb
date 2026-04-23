/**
 * StardustButton — Phase 3 Task 22 (dark-navy pearl CTA).
 *
 * Covers: default label, label override, children override, onClick
 * dispatch, disabled short-circuits onClick, data-slot contract,
 * and the default FlaskConicalIcon rendering (we look for an <svg>
 * inside the icon slot).
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { StardustButton } from "@/components/ui/stardust-button";

describe("StardustButton", () => {
  it("renders the default 'Extract structures' label", () => {
    render(<StardustButton />);
    expect(screen.getByRole("button", { name: /extract structures/i })).toBeInTheDocument();
  });

  it("respects the `label` prop override", () => {
    render(<StardustButton label="Go go go" />);
    expect(screen.getByRole("button", { name: /go go go/i })).toBeInTheDocument();
  });

  it("prefers `children` over `label`", () => {
    render(<StardustButton label="Fallback">Kick off</StardustButton>);
    expect(screen.getByRole("button", { name: /kick off/i })).toBeInTheDocument();
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    render(<StardustButton onClick={onClick} label="Run" />);
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(<StardustButton onClick={onClick} disabled label="Nope" />);
    fireEvent.click(screen.getByRole("button", { name: /nope/i }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('exposes data-slot="stardust-button"', () => {
    render(<StardustButton />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-slot")).toBe("stardust-button");
  });

  it("renders the default FlaskConicalIcon when no icon prop is passed", () => {
    const { container } = render(<StardustButton />);
    // Default icon is lucide FlaskConicalIcon — rendered as an <svg>.
    const svg = container.querySelector("button svg");
    expect(svg).not.toBeNull();
  });

  it("renders a custom icon when provided", () => {
    render(<StardustButton icon={<span data-testid="custom-icon">*</span>} />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });
});
