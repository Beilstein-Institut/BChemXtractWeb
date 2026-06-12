/**
 * Tests for ExtractionTabs container (Plan 10-05 Task 5.2).
 *
 * Verifies Structures (N) + Reactions [Experimental] triggers, default active
 * tab, tab-switch behavior, and — crucially — the URL-state contract (D-08):
 * tab switching is LOCAL STATE ONLY; never calls history.pushState/
 * replaceState and never touches window.location.search.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtractionTabs } from "./ExtractionTabs";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

// Mock ReactionsTab so we don't pull the full implementation chain (hooks,
// ReactionCard, ReactionSheet). The mock still renders `role=note` so the
// tab-switch test can assert mount-on-activate.
vi.mock("@/components/ReactionsTab", () => ({
  ReactionsTab: () => (
    <div data-testid="reactions-tab-body">
      <div role="note">mocked banner</div>
    </div>
  ),
}));

describe("ExtractionTabs", () => {
  let pushSpy: ReturnType<typeof vi.spyOn>;
  let replaceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pushSpy = vi.spyOn(window.history, "pushState");
    replaceSpy = vi.spyOn(window.history, "replaceState");
  });
  afterEach(() => {
    pushSpy.mockRestore();
    replaceSpy.mockRestore();
  });

  function renderTabs() {
    return render(
      <ExtractionTabs substanceCount={12} reactionsTabProps={{ file: null }}>
        <div data-testid="substances-content">Substances body</div>
      </ExtractionTabs>,
    );
  }

  it("renders Structures and Reactions tab triggers", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: /Structures/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Reactions/ })).toBeInTheDocument();
  });

  it("shows structure count in the Structures tab label", () => {
    renderTabs();
    expect(screen.getByText("(12)")).toBeInTheDocument();
  });

  it("includes Experimental pill badge on the Reactions tab", () => {
    renderTabs();
    expect(screen.getByText("Experimental")).toBeInTheDocument();
  });

  it("default active tab is Structures — children visible", () => {
    renderTabs();
    expect(screen.getByTestId("substances-content")).toBeInTheDocument();
  });

  it("clicking Reactions trigger mounts the Reactions tab body", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: /Reactions/ }));
    expect(screen.getByTestId("reactions-tab-body")).toBeInTheDocument();
  });

  it("tab switch does NOT modify browser history or URL (D-08)", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: /Reactions/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Structures/ }));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
