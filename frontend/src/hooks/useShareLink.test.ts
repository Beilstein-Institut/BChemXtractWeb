/**
 * useShareLink — hook tests.
 *
 * Covers the PubChem URL shape (real InChIKey vs SMILES fallback vs no-op),
 * clipboard write, the transient "shared" flag lifecycle, rejection
 * propagation, and timer cleanup on unmount.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPubChemShareUrl, useShareLink } from "./useShareLink";

describe("buildPubChemShareUrl", () => {
  it("uses the real InChIKey when the key is real-shaped", () => {
    expect(
      buildPubChemShareUrl({
        inchiKey: "UHOVQNZJYSORNB-UHFFFAOYSA-N",
        smiles: "c1ccccc1",
      }),
    ).toBe("https://pubchem.ncbi.nlm.nih.gov/#query=UHOVQNZJYSORNB-UHFFFAOYSA-N");
  });

  it("falls back to a SMILES search for a surrogate key", () => {
    // Surrogate key (digits) fails isRealInchiKey -> use SMILES.
    expect(
      buildPubChemShareUrl({
        inchiKey: "SABCDEF12345678-ABCDEFGHIJ-N",
        smiles: "C1CCCCC1",
      }),
    ).toBe("https://pubchem.ncbi.nlm.nih.gov/#query=C1CCCCC1");
  });

  it("URL-encodes SMILES reserved characters", () => {
    expect(buildPubChemShareUrl({ smiles: "C/C=C\\C" })).toBe(
      "https://pubchem.ncbi.nlm.nih.gov/#query=C%2FC%3DC%5CC",
    );
  });

  it("returns null when neither a real key nor a SMILES is available", () => {
    expect(buildPubChemShareUrl({ inchiKey: "SXXX-YYY-N", smiles: "" })).toBeNull();
    expect(buildPubChemShareUrl({})).toBeNull();
  });
});

describe("useShareLink", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      writable: true,
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("copies the PubChem InChIKey link and flips the shared flag", async () => {
    const { result } = renderHook(() => useShareLink());
    await act(async () => {
      await result.current.share({
        inchiKey: "UHOVQNZJYSORNB-UHFFFAOYSA-N",
        smiles: "c1ccccc1",
      });
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe(
      "https://pubchem.ncbi.nlm.nih.gov/#query=UHOVQNZJYSORNB-UHFFFAOYSA-N",
    );
    expect(result.current.shared).toBe(true);
  });

  it("resets the shared flag after 2 seconds", async () => {
    const { result } = renderHook(() => useShareLink());
    await act(async () => {
      await result.current.share({ smiles: "C1CCCCC1" });
    });
    expect(result.current.shared).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.shared).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.shared).toBe(false);
  });

  it("is a no-op when the target can't be resolved", async () => {
    const { result } = renderHook(() => useShareLink());
    await act(async () => {
      await result.current.share({ inchiKey: "SXXX-YYY-N", smiles: "" });
      await result.current.share({});
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.shared).toBe(false);
  });

  it("rejects when clipboard.writeText rejects and leaves shared=false", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const { result } = renderHook(() => useShareLink());
    await act(async () => {
      await expect(result.current.share({ smiles: "c1ccccc1" })).rejects.toThrow("denied");
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(result.current.shared).toBe(false);
  });

  it("cleans up the pending timer on unmount", async () => {
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const { result, unmount } = renderHook(() => useShareLink());
    await act(async () => {
      await result.current.share({ smiles: "c1ccccc1" });
    });
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
  });
});
