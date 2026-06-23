/**
 * EmptyState — concrete tests for the shared empty-state primitive.
 *
 * Co-located with the implementation at
 * `frontend/src/components/ui/empty-state.tsx` — tests live beside the
 * implementation under `ui/`, NOT at `frontend/src/components/EmptyState.test.tsx`.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClockIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

describe("EmptyState", () => {
  it("renders title + message", () => {
    render(<EmptyState title="Empty!" message="Nothing here." />);
    expect(screen.getByText("Empty!")).toBeInTheDocument();
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("renders large variant compact on mobile, min-h-320 at sm+", () => {
    const { container } = render(<EmptyState title="t" message="m" size="large" />);
    expect(container.firstChild).toHaveClass("min-h-[250px]");
    expect(container.firstChild).toHaveClass("sm:min-h-[320px]");
  });

  it("renders compact variant py-8", () => {
    const { container } = render(<EmptyState title="t" message="m" size="compact" />);
    expect(container.firstChild).toHaveClass("py-8");
  });

  it("renders provided lucide icon", () => {
    render(<EmptyState title="t" message="m" icon={ClockIcon} />);
    // ClockIcon is a decorative SVG — check it mounted via aria-hidden
    const icon = document.querySelector("svg[aria-hidden]");
    expect(icon).toBeTruthy();
  });

  it("renders action slot", () => {
    render(<EmptyState title="t" message="m" action={<button>Do it</button>} />);
    expect(screen.getByText("Do it")).toBeInTheDocument();
  });

  it("falls back to PackageOpenIcon when no icon + no illustration", () => {
    render(<EmptyState title="t" message="m" />);
    const icon = document.querySelector("svg[aria-hidden]");
    expect(icon).toBeTruthy();
  });

  it("prefers custom illustration over icon", () => {
    render(
      <EmptyState
        title="t"
        message="m"
        illustration={<span data-testid="custom">C</span>}
        icon={ClockIcon}
      />,
    );
    expect(screen.getByTestId("custom")).toBeInTheDocument();
  });

  it("applies className prop to root", () => {
    const { container } = render(<EmptyState title="t" message="m" className="my-extra" />);
    expect(container.firstChild).toHaveClass("my-extra");
  });
});
