/**
 * ViewPage tests — drop a file, render it, keep the "nothing stored" notice
 * visible throughout. postRenderUpload is mocked; CdxViewer's blob rendering
 * is exercised for real (URL.createObjectURL spied).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockPostRenderUpload = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  postRenderUpload: (...a: unknown[]) => mockPostRenderUpload(...a),
  triggerDownload: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
import { ViewPage } from "./ViewPage";

beforeAll(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cdx");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

function dropFile(name: string, body = "content") {
  const file = new File([body], name);
  fireEvent.drop(screen.getByRole("button", { name: /upload a cdx or cdxml file/i }), {
    dataTransfer: { files: [file] },
  });
}

describe("ViewPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the 'nothing stored' notice on the drop screen", () => {
    render(<ViewPage />);
    expect(screen.getByText(/nothing is stored/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload a cdx or cdxml file/i })).toBeInTheDocument();
  });

  it("renders the viewer after a successful upload, keeping the notice visible", async () => {
    mockPostRenderUpload.mockResolvedValue("<svg><g/></svg>");
    render(<ViewPage />);
    dropFile("scheme.cdx");
    expect(await screen.findByRole("img", { name: /scheme/i })).toHaveAttribute("src", "blob:cdx");
    expect(screen.getByRole("button", { name: /view another file/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing is stored/i)).toBeInTheDocument();
  });

  it("rejects an unsupported extension before hitting the network", () => {
    render(<ViewPage />);
    dropFile("notes.txt");
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/\.cdx or \.cdxml/i));
    expect(mockPostRenderUpload).not.toHaveBeenCalled();
  });

  it("surfaces a render error as a toast and stays on the drop screen", async () => {
    mockPostRenderUpload.mockRejectedValue(new Error("Could not render the file"));
    render(<ViewPage />);
    dropFile("bad.cdx");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not render the file"));
    expect(screen.getByRole("button", { name: /upload a cdx or cdxml file/i })).toBeInTheDocument();
  });
});
