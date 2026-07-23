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

const mockTriggerDownload = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  triggerDownload: (...a: unknown[]) => mockTriggerDownload(...a),
}));

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

  it("keeps the download in the left control cluster (not pushed to the far-right corner)", () => {
    // Regression guard: the download button used to carry `ml-auto`, pinning
    // it to the toolbar's far-right corner where it collided with the inline
    // panel's close button. It must stay grouped with the zoom controls.
    render(<CdxViewer svg="<svg/>" title="x" />);
    expect(screen.getByRole("button", { name: /download drawing/i }).className).not.toContain(
      "ml-auto",
    );
  });

  it("offers SVG and PNG in the download menu, and SVG downloads an svg blob", () => {
    mockTriggerDownload.mockClear();
    render(<CdxViewer svg="<svg/>" title="Scheme 1" />);
    fireEvent.click(screen.getByRole("button", { name: /download drawing/i }));

    const svgItem = screen.getByRole("menuitem", { name: /svg/i });
    expect(screen.getByRole("menuitem", { name: /png/i })).toBeInTheDocument();

    fireEvent.click(svgItem);
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);
    const [blob, filename] = mockTriggerDownload.mock.calls[0];
    expect(blob.type).toBe("image/svg+xml");
    expect(filename).toBe("Scheme_1.svg");
  });

  it("renders a highlight rect overlay when highlights are set", () => {
    const svg =
      '<svg data-cdx-scale="3" data-cdx-origin-x="0" data-cdx-origin-y="0" viewBox="0 0 300 300"></svg>';
    const { container } = render(
      <CdxViewer svg={svg} highlights={[{ l: 10, t: 20, r: 30, b: 50 }]} />,
    );
    const overlay = container.querySelector('[data-slot="cdx-highlight-overlay"]');
    expect(overlay).not.toBeNull();
    const rect = overlay!.querySelector("rect");
    expect(rect).toHaveAttribute("width", "60");
    expect(rect).toHaveAttribute("height", "90");

    // Regression guard: the overlay <svg> must carry explicit width/height
    // (matching the parsed viewBox) so it gets the same intrinsic pixel size
    // as the sibling <img>. A viewBox-only inline <svg> sizes itself via a
    // different (CSS replaced-element) algorithm than the <img> (which sizes
    // from the blob's natural dimensions), so without these attributes the
    // overlay can render at a different size/offset and the highlight rects
    // drift off the structure. jsdom doesn't compute real layout/paint, so it
    // can't verify the two elements are pixel-identical on screen — this
    // attribute check is the unit-level guard; true pixel-parity is confirmed
    // by the browser smoke check in the manual verification pass.
    expect(overlay).toHaveAttribute("width", "300");
    expect(overlay).toHaveAttribute("height", "300");
  });
});
