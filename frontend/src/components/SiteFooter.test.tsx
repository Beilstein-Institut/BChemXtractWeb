/**
 * SiteFooter — tests for the BChemXtract version pill in the footer
 * "Open source · running BChemXtract <version>" line.
 *
 * Behavior under test:
 *   - When VITE_BCHEMXTRACT_VERSION is unset/empty, only "Open source" renders
 *     (no broken link).
 *   - When set, the version is rendered as an external link to the matching
 *     GitHub release tag, with target=_blank and rel=noopener noreferrer.
 *   - The version is URL-encoded into the href to defend against accidental
 *     shell injection if the build-arg ever picks up unsanitized input.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { SiteFooter } from "./SiteFooter";

describe("SiteFooter — BChemXtract version line", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders only 'Open source' when VITE_BCHEMXTRACT_VERSION is unset", () => {
    vi.stubEnv("VITE_BCHEMXTRACT_VERSION", "");
    render(<SiteFooter />);
    expect(screen.getByText("Open source")).toBeInTheDocument();
    expect(screen.queryByText(/running BChemXtract/)).not.toBeInTheDocument();
  });

  describe("with VITE_BCHEMXTRACT_VERSION='v1.1.1'", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_BCHEMXTRACT_VERSION", "v1.1.1");
    });

    it("renders 'running BChemXtract v1.1.1' as a link", () => {
      render(<SiteFooter />);
      const link = screen.getByRole("link", { name: /BChemXtract v1\.1\.1/ });
      expect(link).toHaveAttribute(
        "href",
        "https://github.com/Beilstein-Institut/BChemXtract/releases/tag/v1.1.1",
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("includes the literal 'running' separator text before the link", () => {
      render(<SiteFooter />);
      // The full line reads: "Open source · running BChemXtract v1.1.1"
      const container = screen.getByText("Open source", { exact: false });
      expect(container.textContent).toMatch(/Open source · running BChemXtract v1\.1\.1/);
    });
  });

  it("URL-encodes the version when building the release href", () => {
    // Defensive: even though deploy.sh writes plain semver tags, encodeURIComponent
    // ensures a malformed build-arg can't break the link or smuggle path segments.
    vi.stubEnv("VITE_BCHEMXTRACT_VERSION", "v1.1.1+meta/extra");
    render(<SiteFooter />);
    const link = screen.getByRole("link", { name: /BChemXtract v1\.1\.1\+meta\/extra/ });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/Beilstein-Institut/BChemXtract/releases/tag/v1.1.1%2Bmeta%2Fextra",
    );
  });
});
