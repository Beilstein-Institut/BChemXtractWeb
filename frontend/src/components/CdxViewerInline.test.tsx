/**
 * CdxViewerInline tests.
 *
 * Mirrors CdxViewerDialog.test.tsx: `useCdxRender` is mocked so each test
 * drives the hook lifecycle without a network round trip. The difference
 * from the dialog is that this panel is CONTROLLED by an `open` prop and has
 * no trigger of its own — opening/closing is the caller flipping `open`.
 *
 * Covers:
 *   - open=false renders nothing and does NOT render.
 *   - open=true calls render(extractionId) and, on success, shows the CdxViewer.
 *   - flipping open true->false calls reset().
 *   - FILE_NOT_STORED shows the inline message and does not toast.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockRender = vi.fn();
const mockReset = vi.fn();
let mockHookState: {
  state: "idle" | "loading" | "success" | "error";
  svg: string | null;
  errorCode: string | null;
} = { state: "idle", svg: null, errorCode: null };

vi.mock("@/hooks/useCdxRender", () => ({
  useCdxRender: () => ({
    ...mockHookState,
    render: mockRender,
    reset: mockReset,
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

import { CdxViewerInline } from "./CdxViewerInline";
import { toast } from "sonner";

beforeEach(() => {
  vi.clearAllMocks();
  mockHookState = { state: "idle", svg: null, errorCode: null };
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cdx");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CdxViewerInline", () => {
  it("renders nothing and does not render() when closed", () => {
    const { container } = render(<CdxViewerInline extractionId={42} open={false} />);
    expect(container.querySelector('[data-slot="cdx-viewer-inline"]')).toBeNull();
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("calls render(extractionId) when opened", () => {
    render(<CdxViewerInline extractionId={42} open />);
    expect(mockRender).toHaveBeenCalledWith(42);
  });

  it("renders the CdxViewer (an <img>) once state is success", () => {
    mockHookState = { state: "success", svg: "<svg><g/></svg>", errorCode: null };
    render(<CdxViewerInline extractionId={7} open />);
    expect(screen.getByRole("img", { name: /original chemdraw/i })).toHaveAttribute(
      "src",
      "blob:cdx",
    );
  });

  it("calls reset() when it is closed", () => {
    const { rerender } = render(<CdxViewerInline extractionId={3} open />);
    expect(mockRender).toHaveBeenCalledWith(3);
    rerender(<CdxViewerInline extractionId={3} open={false} />);
    expect(mockReset).toHaveBeenCalled();
  });

  it('shows the "not stored" message for FILE_NOT_STORED and does not toast', () => {
    mockHookState = { state: "error", svg: null, errorCode: "FILE_NOT_STORED" };
    render(<CdxViewerInline extractionId={9} open />);
    expect(
      screen.getByText(/the original file was not stored for this extraction/i),
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
