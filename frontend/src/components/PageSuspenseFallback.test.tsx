import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageSuspenseFallback } from "./PageSuspenseFallback";

describe("PageSuspenseFallback", () => {
  it("renders with role=status and accessible label", () => {
    render(<PageSuspenseFallback />);
    const status = screen.getByRole("status", { name: /loading page/i });
    expect(status).toBeDefined();
  });

  it("exposes the data-slot hook downstream tests rely on", () => {
    const { container } = render(<PageSuspenseFallback />);
    expect(container.querySelector('[data-slot="page-suspense-fallback"]')).not.toBeNull();
  });

  it("includes an sr-only label for assistive tech beyond aria-label", () => {
    render(<PageSuspenseFallback />);
    expect(screen.getByText(/^loading…$/i)).toBeDefined();
  });
});
