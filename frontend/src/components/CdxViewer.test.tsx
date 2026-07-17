/**
 * CdxViewer tests.
 *
 * Covers:
 *   - The SVG renders through the <img blob> pattern (useSvgObjectUrl) —
 *     never dangerouslySetInnerHTML — asserted via role=img + blob src.
 *   - The zoom-in toolbar control updates the --cdx-zoom CSS custom
 *     property on the viewport element.
 *
 * URL.createObjectURL/revokeObjectURL are spied (not stubbed from scratch):
 * Node's global URL already implements them, so `vi.spyOn` works directly —
 * matches the convention in HistoryList.test.tsx / apiClient.test.ts.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CdxViewer } from "./CdxViewer";

beforeAll(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cdx");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

describe("CdxViewer", () => {
  it("renders the SVG as an <img> blob (not inline HTML)", () => {
    render(<CdxViewer svg="<svg><g/></svg>" title="Scheme 1" />);
    const img = screen.getByRole("img", { name: /scheme 1/i });
    expect(img).toHaveAttribute("src", "blob:cdx");
  });

  it("zooms in when the zoom-in control is clicked", () => {
    render(<CdxViewer svg="<svg/>" title="x" />);
    const before = screen.getByTestId("cdx-viewport").style.getPropertyValue("--cdx-zoom");
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    const after = screen.getByTestId("cdx-viewport").style.getPropertyValue("--cdx-zoom");
    expect(after).not.toBe(before);
  });

  it("zooms via a native (non-passive) wheel listener and prevents the page scroll", () => {
    render(<CdxViewer svg="<svg/>" title="x" />);
    const viewport = screen.getByTestId("cdx-viewport");
    const before = viewport.style.getPropertyValue("--cdx-zoom");

    // Dispatched natively (not via fireEvent/React synthetic events) so the
    // listener under test — a real addEventListener("wheel", ..., { passive:
    // false }) — is the one that runs, mirroring how the browser dispatches
    // real wheel input.
    const event = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
    act(() => {
      viewport.dispatchEvent(event);
    });

    const after = viewport.style.getPropertyValue("--cdx-zoom");
    expect(after).not.toBe(before);
    expect(event.defaultPrevented).toBe(true);
  });
});
