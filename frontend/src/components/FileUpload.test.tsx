/**
 * Tests for the FileUpload component (Phase 3 wizard Step 1).
 * Vitest globals: true — no need to import describe/it/expect.
 */
import { render, screen, fireEvent } from "@testing-library/react";
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
    expect(
      screen.getByRole("button", { name: "Upload CDX or CDXML file" }),
    ).toBeInTheDocument();
  });

  it("renders helper text 'Drag & drop your CDX or CDXML file'", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    expect(
      screen.getByText("Drag & drop your CDX or CDXML file"),
    ).toBeInTheDocument();
  });

  it("renders 'or click to browse' helper copy", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    expect(screen.getByText("or click to browse")).toBeInTheDocument();
  });

  it("rejects .pdf files via toast.error", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = makeFile("document.pdf");
    fireEvent.change(input, { target: { files: [file] } });
    expect(mockToastError).toHaveBeenCalledWith(
      "Only .cdx and .cdxml files are supported.",
    );
  });

  it("rejects files >50 MB via toast.error when dropped as a single file", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = makeFile("large.cdx", 52_428_801);
    fireEvent.change(input, { target: { files: [file] } });
    expect(mockToastError).toHaveBeenCalledWith(
      "File exceeds the 50 MB limit.",
    );
  });

  it("calls onExtract fast-path when a single valid .cdx file is selected with empty queue", () => {
    const onExtract = vi.fn();
    render(<FileUpload onExtract={onExtract} isLoading={false} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = makeFile("sample.cdx");
    fireEvent.change(input, { target: { files: [file] } });
    expect(onExtract).toHaveBeenCalledWith(file);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("queues 2 files and shows the Extract N files CTA", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const a = makeFile("a.cdx");
    const b = makeFile("b.cdx");
    fireEvent.change(input, { target: { files: [a, b] } });
    // Queue list renders both names
    expect(screen.getByText("a.cdx")).toBeInTheDocument();
    expect(screen.getByText("b.cdx")).toBeInTheDocument();
    // CTA reflects queue length
    expect(
      screen.getByRole("button", { name: /Extract 2 files/i }),
    ).toBeInTheDocument();
  });

  it("removing a queued file drops it from the list", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
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
    render(
      <FileUpload
        onExtract={vi.fn()}
        onStartBatch={onStartBatch}
        isLoading={false}
      />,
    );
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
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
    render(
      <FileUpload
        onExtract={vi.fn()}
        isLoading={true}
        loadingFilename="sample.cdx"
      />,
    );
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion?.textContent).toContain("Extracting structures");
  });
});
