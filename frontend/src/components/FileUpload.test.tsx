/**
 * Tests for the FileUpload component (Phase 3 wizard Step 1).
 * Vitest globals: true — no need to import describe/it/expect.
 */
import { act, render, screen, fireEvent } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import { FileUpload } from "./FileUpload";

// Mock sonner so we can assert toast calls without a real Toaster in DOM
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
const mockToastError = toast.error as ReturnType<typeof vi.fn>;

function makeFile(name: string, size: number = 1024): File {
  const file = new File(["x".repeat(Math.min(size, 1))], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("FileUpload component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the drop zone with data-slot='drop-zone'", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const zone = document.querySelector("[data-slot='drop-zone']");
    expect(zone).not.toBeNull();
  });

  it("renders the Upload CDX or CDXML aria-label on the drop target", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    expect(screen.getByRole("button", { name: "Upload CDX or CDXML file" })).toBeInTheDocument();
  });

  it("renders both pointer-variant headlines (desktop + mobile copy in the DOM)", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    // Both copy variants live in the DOM; CSS @media(pointer:fine) toggles
    // which one is visible at runtime. `hidden: true` finds either.
    expect(screen.getByText("Drop CDX or CDXML files", { hidden: true })).toBeInTheDocument();
    expect(screen.getByText("Choose CDX or CDXML files", { hidden: true })).toBeInTheDocument();
  });

  it("renders 'or click to browse' helper copy (desktop variant)", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    expect(screen.getByText("or click to browse", { hidden: true })).toBeInTheDocument();
  });

  it("rejects .pdf files via toast.error", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile("document.pdf");
    fireEvent.change(input, { target: { files: [file] } });
    expect(mockToastError).toHaveBeenCalledWith(
      "File type not supported. Drop a .cdx or .cdxml file.",
    );
  });

  it("rejects files >50 MB via toast.error when dropped as a single file", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile("large.cdx", 52_428_801);
    fireEvent.change(input, { target: { files: [file] } });
    expect(mockToastError).toHaveBeenCalledWith(
      "File exceeds 50 MB. Split or compress before uploading.",
    );
  });

  it("calls onExtract fast-path when a single valid .cdx file is selected with empty queue", () => {
    const onExtract = vi.fn();
    render(<FileUpload onExtract={onExtract} isLoading={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile("sample.cdx");
    fireEvent.change(input, { target: { files: [file] } });
    expect(onExtract).toHaveBeenCalledWith(file);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("queues 2 files and shows the Extract N files CTA", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const a = makeFile("a.cdx");
    const b = makeFile("b.cdx");
    fireEvent.change(input, { target: { files: [a, b] } });
    // Queue list renders both names
    expect(screen.getByText("a.cdx")).toBeInTheDocument();
    expect(screen.getByText("b.cdx")).toBeInTheDocument();
    // CTA reflects queue length
    expect(screen.getByRole("button", { name: /Extract 2 files/i })).toBeInTheDocument();
  });

  it("removing a queued file drops it from the list", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [makeFile("a.cdx"), makeFile("b.cdx")] },
    });
    const removeBtn = screen.getByRole("button", { name: "Remove a.cdx" });
    fireEvent.click(removeBtn);
    expect(screen.queryByText("a.cdx")).not.toBeInTheDocument();
    expect(screen.getByText("b.cdx")).toBeInTheDocument();
  });

  it("Extract N files CTA fires onStartBatch with queued files", () => {
    const onStartBatch = vi.fn();
    render(<FileUpload onExtract={vi.fn()} onStartBatch={onStartBatch} isLoading={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const a = makeFile("a.cdx");
    const b = makeFile("b.cdx");
    fireEvent.change(input, { target: { files: [a, b] } });
    const cta = screen.getByRole("button", { name: /Extract 2 files/i });
    fireEvent.click(cta);
    expect(onStartBatch).toHaveBeenCalledWith([a, b]);
  });

  it("does not render the drop zone when isLoading is true", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={true} />);
    expect(
      screen.queryByRole("button", { name: "Upload CDX or CDXML file" }),
    ).not.toBeInTheDocument();
  });

  it("renders aria-live loading message when isLoading is true", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={true} loadingFilename="sample.cdx" />);
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion?.textContent).toContain("Extracting structures");
  });

  describe("drop-zone state machine", () => {
    it("starts in data-state='idle' data-queue='empty'", () => {
      render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
      const zone = document.querySelector("[data-slot='drop-zone']") as HTMLElement;
      expect(zone.dataset.state).toBe("idle");
      expect(zone.dataset.queue).toBe("empty");
    });

    it("flips data-state='drag-over' on dragover and back to idle on dragleave", () => {
      render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
      const zone = document.querySelector("[data-slot='drop-zone']") as HTMLElement;
      fireEvent.dragOver(zone);
      expect(zone.dataset.state).toBe("drag-over");
      fireEvent.dragLeave(zone);
      expect(zone.dataset.state).toBe("idle");
    });

    it("flips data-queue='building' once files are queued", () => {
      render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, {
        target: { files: [makeFile("a.cdx"), makeFile("b.cdx")] },
      });
      const zone = document.querySelector("[data-slot='drop-zone']") as HTMLElement;
      expect(zone.dataset.queue).toBe("building");
      // Compressed copy is rendered.
      expect(screen.getByText("Drop more, or click to add")).toBeInTheDocument();
    });

    it("flips data-queue='full' at exactly 20 queued files", () => {
      render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = Array.from({ length: 20 }, (_, i) => makeFile(`f${i}.cdx`));
      fireEvent.change(input, { target: { files } });
      const zone = document.querySelector("[data-slot='drop-zone']") as HTMLElement;
      expect(zone.dataset.queue).toBe("full");
      expect(screen.getByText("Batch is full (20 files)")).toBeInTheDocument();
    });

    it("at queue=full, an additional drop triggers reject flash and one toast", () => {
      vi.useFakeTimers();
      render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      // Fill the queue.
      const initial = Array.from({ length: 20 }, (_, i) => makeFile(`f${i}.cdx`));
      fireEvent.change(input, { target: { files: initial } });
      mockToastError.mockClear();

      // One more file: rejected.
      fireEvent.change(input, { target: { files: [makeFile("f21.cdx")] } });
      const zone = document.querySelector("[data-slot='drop-zone']") as HTMLElement;
      expect(zone.dataset.state).toBe("reject");
      expect(mockToastError).toHaveBeenCalledTimes(1);
      expect(mockToastError).toHaveBeenCalledWith(
        "Batch limit hit (20 files). Remove some, or run them as separate batches.",
      );
      // Reject flash clears after the timeout window.
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(zone.dataset.state).toBe("idle");
      vi.useRealTimers();
    });

    it("dropping multiple invalid files surfaces exactly one toast", () => {
      render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, {
        target: { files: [makeFile("a.pdf"), makeFile("b.docx"), makeFile("c.png")] },
      });
      // Was 3 toasts in the prior implementation; the craft pass consolidates
      // to one toast per drop event so the user gets a single clear signal.
      expect(mockToastError).toHaveBeenCalledTimes(1);
      expect(mockToastError).toHaveBeenCalledWith(
        "File type not supported. Drop a .cdx or .cdxml file.",
      );
    });
  });
});
