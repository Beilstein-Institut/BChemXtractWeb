import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/apiClient";
import { PubChemPreferencesProvider } from "@/context/PubChemPreferencesContext";
import { usePubChemPreferences } from "@/hooks/usePubChemPreferences";

function wrapper({ children }: { children: React.ReactNode }) {
  return <PubChemPreferencesProvider>{children}</PubChemPreferencesProvider>;
}

beforeEach(() => {
  // The provider fetches server status on mount; a pending promise keeps these
  // opt-in/localStorage assertions free of an unrelated async state update.
  vi.spyOn(api, "getPubChemStatus").mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("usePubChemPreferences", () => {
  it("defaults to disabled", () => {
    const { result } = renderHook(() => usePubChemPreferences(), { wrapper });
    expect(result.current.enabled).toBe(false);
  });

  it("persists the opt-in to localStorage", () => {
    const { result } = renderHook(() => usePubChemPreferences(), { wrapper });
    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem("bchemxtract-pubchem-enabled")).toBe("true");
  });
});
