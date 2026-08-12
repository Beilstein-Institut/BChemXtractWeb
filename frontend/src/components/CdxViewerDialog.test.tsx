/**
 * CdxViewerDialog tests.
 *
 * `useCdxRender` is mocked directly (mirrors the useBrowse mock pattern in
 * StructureBrowser.test.tsx) so each test can drive the hook's lifecycle
 * state without a real network round trip. The base-ui Dialog itself is
 * NOT mocked — it portals to document.body in jsdom (see dialog.test.tsx),
 * so `screen` queries reach the popup once opened.
 *
 * Covers:
 *   - Opening the dialog (clicking "View as drawn") calls render(extractionId).
 *   - success state renders the real CdxViewer, whose SVG shows as an <img>.
 *   - error + errorCode "FILE_NOT_STORED" shows the inline "not stored" message
 *     and does NOT toast.
 *   - error with any other code fires toast.error (generic failure banner).
 *   - closing the dialog calls reset().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

import { CdxViewerDialog } from "./CdxViewerDialog";
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

describe("CdxViewerDialog", () => {
  it('renders a "View as drawn" trigger button', () => {
    render(<CdxViewerDialog extractionId={42} />);
    expect(screen.getByRole("button", { name: /view as drawn/i })).toBeInTheDocument();
  });

  it("calls render(extractionId) when the dialog is opened", () => {
    render(<CdxViewerDialog extractionId={42} />);
    fireEvent.click(screen.getByRole("button", { name: /view as drawn/i }));
    expect(mockRender).toHaveBeenCalledWith(42);
  });

  it("shows a spinner while state is loading", () => {
    mockHookState = { state: "loading", svg: null, errorCode: null };
    render(<CdxViewerDialog extractionId={1} />);
    fireEvent.click(screen.getByRole("button", { name: /view as drawn/i }));
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("renders the CdxViewer (an <img>) once state is success", () => {
    mockHookState = { state: "success", svg: "<svg><g/></svg>", errorCode: null };
    render(<CdxViewerDialog extractionId={7} />);
    fireEvent.click(screen.getByRole("button", { name: /view as drawn/i }));
    const img = screen.getByRole("img", { name: /original drawing/i });
    expect(img).toHaveAttribute("src", "blob:cdx");
  });

  it('shows the "not stored" message for FILE_NOT_STORED and does not toast', () => {
    mockHookState = { state: "error", svg: null, errorCode: "FILE_NOT_STORED" };
    render(<CdxViewerDialog extractionId={9} />);
    fireEvent.click(screen.getByRole("button", { name: /view as drawn/i }));
    expect(
      screen.getByText(/the original file was not stored for this extraction/i),
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts a generic error for any other error code", () => {
    mockHookState = { state: "error", svg: null, errorCode: "BOOM" };
    render(<CdxViewerDialog extractionId={9} />);
    expect(toast.error).toHaveBeenCalledWith("Could not render the original file.");
  });

  it('shows an inline error + "Try again" for a non-FILE_NOT_STORED error, and retries on click', () => {
    mockHookState = { state: "error", svg: null, errorCode: "RENDER_FAILED" };
    render(<CdxViewerDialog extractionId={11} />);
    fireEvent.click(screen.getByRole("button", { name: /view as drawn/i }));

    expect(screen.getByText(/couldn't render the original file/i)).toBeInTheDocument();

    expect(mockRender).toHaveBeenCalledTimes(1); // from opening the dialog

    const retry = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retry);
    expect(mockRender).toHaveBeenCalledTimes(2);
    expect(mockRender).toHaveBeenLastCalledWith(11);
  });

  it('shows the inline error + "Try again" when errorCode is null (e.g. network error)', () => {
    mockHookState = { state: "error", svg: null, errorCode: null };
    render(<CdxViewerDialog extractionId={12} />);
    fireEvent.click(screen.getByRole("button", { name: /view as drawn/i }));

    expect(screen.getByText(/couldn't render the original file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("calls reset() when the dialog is closed", () => {
    mockHookState = { state: "success", svg: "<svg/>", errorCode: null };
    render(<CdxViewerDialog extractionId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /view as drawn/i }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(mockReset).toHaveBeenCalled();
  });
});
