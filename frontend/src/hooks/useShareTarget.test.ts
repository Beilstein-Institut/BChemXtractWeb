/**
 * useShareTarget — hook tests.
 *
 * Covers hash parsing, resolving the `#s=` deep link via the (mocked) search
 * API into `onResolve`, the not-found toast, and clearing the hash.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseShareHash, clearShareHash, useShareTarget } from "./useShareTarget";

const postSearch = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  postSearch: (...args: unknown[]) => postSearch(...args),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

function setHash(hash: string) {
  window.history.replaceState(null, "", "/browse" + hash);
}

describe("parseShareHash", () => {
  it("extracts and decodes the key", () => {
    expect(parseShareHash("#s=UHOVQNZJYSORNB-UHFFFAOYSA-N")).toBe("UHOVQNZJYSORNB-UHFFFAOYSA-N");
    expect(parseShareHash("#s=a%20b")).toBe("a b");
  });

  it("returns null for non-share or empty hashes", () => {
    expect(parseShareHash("")).toBeNull();
    expect(parseShareHash("#other=1")).toBeNull();
    expect(parseShareHash("#s=")).toBeNull();
  });
});

describe("useShareTarget", () => {
  beforeEach(() => {
    postSearch.mockReset();
    toastError.mockReset();
    setHash("");
  });

  afterEach(() => {
    setHash("");
  });

  it("resolves the hash key and calls onResolve with the substance", async () => {
    const substance = { inchi_key: "K", smiles: "c1ccccc1" };
    postSearch.mockResolvedValue({ results: [{ substance }], total: 1 });
    setHash("#s=K");
    const onResolve = vi.fn();

    renderHook(() => useShareTarget(onResolve));

    await waitFor(() => expect(onResolve).toHaveBeenCalledWith(substance));
    expect(postSearch).toHaveBeenCalledWith({
      query: "K",
      type: "inchi_key",
      scope: "global",
    });
  });

  it("toasts when the key resolves to nothing", async () => {
    postSearch.mockResolvedValue({ results: [], total: 0 });
    setHash("#s=MISSING");
    const onResolve = vi.fn();

    renderHook(() => useShareTarget(onResolve));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("does nothing when there is no share hash", () => {
    const onResolve = vi.fn();
    renderHook(() => useShareTarget(onResolve));
    expect(postSearch).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
  });
});

describe("clearShareHash", () => {
  it("removes a #s= hash from the URL", () => {
    setHash("#s=K");
    clearShareHash();
    expect(window.location.hash).toBe("");
  });

  it("leaves a non-share hash untouched", () => {
    setHash("#other=1");
    clearShareHash();
    expect(window.location.hash).toBe("#other=1");
  });
});
