/**
 * BatchFilePreview — TDD test suite.
 *
 * Strategy: Base UI PreviewCard opens on pointer hover / focus, but jsdom
 * does not reliably fire the delay-based hover open. We use the controlled
 * `open`/`onOpenChange` pass-through exposed by BatchFilePreview for tests
 * so we can open the card imperatively, while production stays hover-driven
 * (no `open` prop passed).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, afterEach } from "vitest";
import { BatchFilePreview } from "./BatchFilePreview";
import * as api from "@/lib/apiClient";
import type { ExtractionResponse } from "@/types/chemistry";

afterEach(() => {
  vi.restoreAllMocks();
});

const detail: ExtractionResponse = {
  filename: "a.cdx",
  format: "cdx",
  file_size: 1,
  structure_count: 5,
  extraction_time_ms: 1,
  warnings: [],
  info: { no_fragments: 0, no_inchis: 0, no_substances: 5 },
  substances: Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    inchi: "",
    inchi_key: "",
    smiles: "C",
    extended_smiles: "",
    iupac_name: "",
    molecular_formula: "C6H6",
    aux_info: "",
    mdlv3000: "",
    abbreviations: {},
    svg: "<svg/>",
    svg_cdx: "",
  })),
};

it("fetches once on open and shows a 'view all' affordance with the count", async () => {
  const spy = vi.spyOn(api, "getHistoryDetail").mockResolvedValue(detail as never);

  // Base UI PreviewCard hover-delay semantics do not fire reliably in jsdom,
  // so we use the controlled `open` pass-through to drive the card open
  // imperatively (test-only path — production stays hover-driven).
  const { rerender } = render(
    <BatchFilePreview
      extractionId={7}
      filename="a.cdx"
      structureCount={5}
      onViewExtraction={() => {}}
      open={false}
    >
      <button>row</button>
    </BatchFilePreview>,
  );

  rerender(
    <BatchFilePreview
      extractionId={7}
      filename="a.cdx"
      structureCount={5}
      onViewExtraction={() => {}}
      open={true}
    >
      <button>row</button>
    </BatchFilePreview>,
  );

  await waitFor(() => expect(spy).toHaveBeenCalledWith(7));
  expect(await screen.findByText(/view all 5 structures/i)).toBeTruthy();
});

it("caches: a second open does NOT refetch", async () => {
  const spy = vi.spyOn(api, "getHistoryDetail").mockResolvedValue(detail as never);

  const { rerender } = render(
    <BatchFilePreview
      extractionId={7}
      filename="a.cdx"
      structureCount={5}
      onViewExtraction={() => {}}
      open={false}
    >
      <button>row</button>
    </BatchFilePreview>,
  );

  // First open
  rerender(
    <BatchFilePreview
      extractionId={7}
      filename="a.cdx"
      structureCount={5}
      onViewExtraction={() => {}}
      open={true}
    >
      <button>row</button>
    </BatchFilePreview>,
  );

  await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/view all 5 structures/i)).toBeTruthy();

  // Close and reopen — should NOT refetch
  rerender(
    <BatchFilePreview
      extractionId={7}
      filename="a.cdx"
      structureCount={5}
      onViewExtraction={() => {}}
      open={false}
    >
      <button>row</button>
    </BatchFilePreview>,
  );
  rerender(
    <BatchFilePreview
      extractionId={7}
      filename="a.cdx"
      structureCount={5}
      onViewExtraction={() => {}}
      open={true}
    >
      <button>row</button>
    </BatchFilePreview>,
  );

  await waitFor(() => screen.getByText(/view all 5 structures/i));
  // Still only one call
  expect(spy).toHaveBeenCalledTimes(1);
});

it("calls onViewExtraction with the extractionId when 'view all' is clicked", async () => {
  vi.spyOn(api, "getHistoryDetail").mockResolvedValue(detail as never);
  const onView = vi.fn();

  render(
    <BatchFilePreview
      extractionId={7}
      filename="a.cdx"
      structureCount={5}
      onViewExtraction={onView}
      open={true}
    >
      <button>row</button>
    </BatchFilePreview>,
  );

  await waitFor(() => expect(api.getHistoryDetail).toHaveBeenCalledWith(7));
  const link = await screen.findByText(/view all 5 structures/i);
  fireEvent.click(link);
  expect(onView).toHaveBeenCalledWith(7);
});

it("shows 'Preview unavailable' on fetch failure", async () => {
  vi.spyOn(api, "getHistoryDetail").mockRejectedValue(new Error("network error"));

  render(
    <BatchFilePreview
      extractionId={7}
      filename="a.cdx"
      structureCount={5}
      onViewExtraction={() => {}}
      open={true}
    >
      <button>row</button>
    </BatchFilePreview>,
  );

  expect(await screen.findByText(/preview unavailable/i)).toBeTruthy();
});
