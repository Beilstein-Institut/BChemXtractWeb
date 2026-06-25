import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { BatchViewPage } from "./BatchViewPage";
import * as api from "@/lib/apiClient";

function setBatchParam(id: string | null) {
  const search = id ? `?batch=${id}` : "";
  window.history.replaceState(null, "", `/batch${search}`);
}

const detail = (filename: string, formulas: string[]) => ({
  filename,
  format: "cdx",
  file_size: 1,
  structure_count: formulas.length,
  extraction_time_ms: 1,
  info: { no_fragments: 0, no_inchis: 0, no_substances: formulas.length },
  warnings: [],
  substances: formulas.map((f, i) => ({
    id: i + 1,
    inchi: "",
    inchi_key: "",
    smiles: "C",
    extended_smiles: "",
    iupac_name: "",
    molecular_formula: f,
    aux_info: "",
    mdlv3000: "",
    abbreviations: {},
    svg: "<svg/>",
    svg_cdx: "",
  })),
});

it("renders one section per file with filename header, table by default", async () => {
  setBatchParam("b1");
  vi.spyOn(api, "getBatchExtractions").mockResolvedValue({
    batch_id: "b1",
    files: [
      { extraction_id: 1, filename: "a.cdx", structure_count: 1 },
      { extraction_id: 2, filename: "b.cdx", structure_count: 2 },
    ],
  });
  vi.spyOn(api, "getHistoryDetail").mockImplementation(async (id: number) =>
    id === 1 ? detail("a.cdx", ["C6H6"]) : detail("b.cdx", ["CH4O", "C2H6O"]),
  );

  render(<BatchViewPage />);

  expect(await screen.findByText("a.cdx")).toBeTruthy();
  expect(screen.getByText("b.cdx")).toBeTruthy();
  // Table is the default view → column headers present.
  await waitFor(() => expect(screen.getAllByText("Molecular Formula").length).toBeGreaterThan(0));
});

it("shows an empty state when no batch id is in the URL", () => {
  setBatchParam(null);
  render(<BatchViewPage />);
  expect(screen.getByText(/no batch/i)).toBeTruthy();
});

it("isolates per-file failures: failed file shows inline error; other file still renders", async () => {
  setBatchParam("b2");
  vi.spyOn(api, "getBatchExtractions").mockResolvedValue({
    batch_id: "b2",
    files: [
      { extraction_id: 10, filename: "bad.cdx", structure_count: 1 },
      { extraction_id: 11, filename: "good.cdx", structure_count: 1 },
    ],
  });
  vi.spyOn(api, "getHistoryDetail").mockImplementation(async (id: number) => {
    if (id === 10) throw new Error("network error");
    return detail("good.cdx", ["C6H6"]);
  });

  render(<BatchViewPage />);

  // (a) failed file's section shows the inline error message
  expect(
    await screen.findByText("Could not load this file's structures. Refresh to retry."),
  ).toBeTruthy();

  // (b) second file's section still renders its filename header
  expect(screen.getByText("good.cdx")).toBeTruthy();
});
