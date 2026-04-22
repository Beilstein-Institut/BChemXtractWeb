/**
 * Tests for PageContainer — Phase 3 Task 8.
 * Vitest globals enabled; describe/it/expect implicit.
 */
import { render, screen } from "@testing-library/react";

import { PageContainer } from "./PageContainer";

describe("PageContainer", () => {
  it("renders children inside a max-w-7xl wrapper with data-slot", () => {
    render(
      <PageContainer>
        <p>hello</p>
      </PageContainer>,
    );
    const container = screen.getByText("hello").parentElement!;
    expect(container.dataset.slot).toBe("page-container");
    expect(container.className).toMatch(/max-w-7xl/);
    expect(container.className).toMatch(/mx-auto/);
  });

  it("merges caller className after defaults via tailwind-merge", () => {
    render(
      <PageContainer className="max-w-4xl" data-testid="pc">
        <span>x</span>
      </PageContainer>,
    );
    const container = screen.getByTestId("pc");
    // The caller's max-w-4xl should win.
    expect(container.className).toMatch(/max-w-4xl/);
    expect(container.className).not.toMatch(/max-w-7xl/);
  });

  it("forwards arbitrary HTML attributes", () => {
    render(
      <PageContainer aria-label="main region" data-testid="pc">
        <span />
      </PageContainer>,
    );
    const container = screen.getByTestId("pc");
    expect(container.getAttribute("aria-label")).toBe("main region");
  });
});
