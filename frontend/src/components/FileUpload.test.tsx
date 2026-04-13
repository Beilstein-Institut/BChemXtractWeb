/**
 * Tests for the FileUpload component.
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
  // Override size since File constructor size is determined by content length
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("FileUpload component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an element with role="button" and aria-label="Upload CDX or CDXML file"', () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    expect(
      screen.getByRole("button", { name: "Upload CDX or CDXML file" })
    ).toBeInTheDocument();
  });

  it('renders the text "Drag & drop your CDX or CDXML file"', () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    expect(
      screen.getByText("Drag & drop your CDX or CDXML file")
    ).toBeInTheDocument();
  });

  it('renders the text "or click to browse"', () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    expect(screen.getByText("or click to browse")).toBeInTheDocument();
  });

  it('renders the text "Supports .cdx and .cdxml — up to 50 MB"', () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    expect(
      screen.getByText("Supports .cdx and .cdxml — up to 50 MB")
    ).toBeInTheDocument();
  });

  it('renders a button with accessible text "Extract structures"', () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    // The CTA button is separate from the drop zone's role="button"
    expect(screen.getByText("Extract structures")).toBeInTheDocument();
  });

  it('calls toast.error with "Only .cdx and .cdxml files are supported." for .pdf files', () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile("document.pdf");
    fireEvent.change(input, { target: { files: [file] } });
    expect(mockToastError).toHaveBeenCalledWith("Only .cdx and .cdxml files are supported.");
  });

  it('calls toast.error with "File exceeds the 50 MB limit." when file size is 52428801 bytes', () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile("large.cdx", 52_428_801);
    fireEvent.change(input, { target: { files: [file] } });
    expect(mockToastError).toHaveBeenCalledWith("File exceeds the 50 MB limit.");
  });

  it("calls onExtract with the File when a valid .cdx file is provided", () => {
    const onExtract = vi.fn();
    render(<FileUpload onExtract={onExtract} isLoading={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile("sample.cdx");
    fireEvent.change(input, { target: { files: [file] } });
    expect(onExtract).toHaveBeenCalledWith(file);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("does not render the drop zone element when isLoading is true", () => {
    render(<FileUpload onExtract={vi.fn()} isLoading={true} />);
    expect(
      screen.queryByRole("button", { name: "Upload CDX or CDXML file" })
    ).not.toBeInTheDocument();
  });

  it('renders an element with aria-live="polite" containing "Extracting structures" when isLoading is true', () => {
    render(
      <FileUpload
        onExtract={vi.fn()}
        isLoading={true}
        loadingFilename="sample.cdx"
      />
    );
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion?.textContent).toContain("Extracting structures");
  });
});
