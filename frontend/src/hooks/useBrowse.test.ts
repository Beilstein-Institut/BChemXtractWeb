/**
 * Tests for useBrowse hook.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * The getSubstancesPage API client is mocked so we can test the hook's
 * state machine, URL sync, and multi-select in isolation.
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { PagedSubstancesResponse } from "@/types/chemistry";

// Mock the apiClient module
vi.mock("@/lib/apiClient", () => ({
  getSubstancesPage: vi.fn(),
}));

// Mock window.history.replaceState to avoid jsdom navigation errors
const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});

import { useBrowse } from "./useBrowse";
import { getSubstancesPage } from "@/lib/apiClient";

const mockGetSubstancesPage = getSubstancesPage as ReturnType<typeof vi.fn>;

function makeMockPage(overrides?: Partial<PagedSubstancesResponse>): PagedSubstancesResponse {
  return {
    items: [
      {
        id: 1,
        inchi: "InChI=1S/C6H6/c1-2-4-6-5-3-1/h1-6H",
        inchi_key: "UHOVQNZJYSORNB-UHFFFAOYSA-N",
        smiles: "c1ccccc1",
        extended_smiles: "c1ccccc1",
        iupac_name: "benzene",
        molecular_formula: "C6H6",
        aux_info: "",
        mdlv3000: "",
        abbreviations: {},
        svg: "",
      },
      {
        id: 2,
        inchi: "InChI=1S/CH4/h1H4",
        inchi_key: "VNWKTOKETHGBQD-UHFFFAOYSA-N",
        smiles: "C",
        extended_smiles: "C",
        iupac_name: "methane",
        molecular_formula: "CH4",
        aux_info: "",
        mdlv3000: "",
        abbreviations: {},
        svg: "",
      },
    ],
    total: 2,
    page: 1,
    size: 12,
    pages: 1,
    ...overrides,
  };
}

describe("useBrowse hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceStateSpy.mockClear();
  });

  it("returns idle state when no extractionId provided", () => {
    const { result } = renderHook(() => useBrowse(null));
    expect(result.current.browseState).toBe("idle");
    expect(result.current.page).toBeNull();
    expect(mockGetSubstancesPage).not.toHaveBeenCalled();
  });

  it("returns idle state when extractionId is undefined", () => {
    const { result } = renderHook(() => useBrowse(undefined));
    expect(result.current.browseState).toBe("idle");
    expect(mockGetSubstancesPage).not.toHaveBeenCalled();
  });

  it("getSubstancesPage is called when extractionId changes", async () => {
    const mockPage = makeMockPage();
    mockGetSubstancesPage.mockResolvedValue(mockPage);

    const { result } = renderHook(() => useBrowse(42));

    await waitFor(() => {
      expect(result.current.browseState).toBe("success");
    });

    expect(mockGetSubstancesPage).toHaveBeenCalledWith(42, 1, 12, "extraction_order");
    expect(result.current.page).toEqual(mockPage);
  });

  it("setView updates view state", () => {
    mockGetSubstancesPage.mockResolvedValue(makeMockPage());

    const { result } = renderHook(() => useBrowse(null));
    expect(result.current.view).toBe("grid");

    act(() => {
      result.current.setView("table");
    });

    expect(result.current.view).toBe("table");
  });

  it("setSort updates sort state and resets to page 1", async () => {
    const mockPage = makeMockPage();
    mockGetSubstancesPage.mockResolvedValue(mockPage);

    const { result } = renderHook(() => useBrowse(42));

    await waitFor(() => expect(result.current.browseState).toBe("success"));

    act(() => {
      result.current.setSort("formula");
    });

    expect(result.current.sort).toBe("formula");
    expect(result.current.currentPage).toBe(1);
  });

  it("toggleSelect adds id to selectedIds when not present", () => {
    const { result } = renderHook(() => useBrowse(null));

    act(() => {
      result.current.toggleSelect(5);
    });

    expect(result.current.selectedIds.has(5)).toBe(true);
  });

  it("toggleSelect removes id from selectedIds when already present", () => {
    const { result } = renderHook(() => useBrowse(null));

    act(() => {
      result.current.toggleSelect(5);
    });
    expect(result.current.selectedIds.has(5)).toBe(true);

    act(() => {
      result.current.toggleSelect(5);
    });
    expect(result.current.selectedIds.has(5)).toBe(false);
  });

  it("selectAll selects all ids on current page", async () => {
    const mockPage = makeMockPage();
    mockGetSubstancesPage.mockResolvedValue(mockPage);

    const { result } = renderHook(() => useBrowse(42));

    await waitFor(() => expect(result.current.browseState).toBe("success"));

    act(() => {
      result.current.selectAll();
    });

    expect(result.current.selectedIds.has(1)).toBe(true);
    expect(result.current.selectedIds.has(2)).toBe(true);
    expect(result.current.selectedIds.size).toBe(2);
  });

  it("clearSelection empties selectedIds", async () => {
    const mockPage = makeMockPage();
    mockGetSubstancesPage.mockResolvedValue(mockPage);

    const { result } = renderHook(() => useBrowse(42));

    await waitFor(() => expect(result.current.browseState).toBe("success"));

    act(() => {
      result.current.selectAll();
    });
    expect(result.current.selectedIds.size).toBe(2);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("transitions to error state when getSubstancesPage rejects", async () => {
    mockGetSubstancesPage.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useBrowse(99));

    await waitFor(() => {
      expect(result.current.browseState).toBe("error");
    });

    expect(result.current.page).toBeNull();
  });

  it("contains window.history.replaceState call (URL sync)", () => {
    mockGetSubstancesPage.mockResolvedValue(makeMockPage());

    const { result } = renderHook(() => useBrowse(null));

    act(() => {
      result.current.setView("table");
    });

    expect(replaceStateSpy).toHaveBeenCalled();
  });
});
