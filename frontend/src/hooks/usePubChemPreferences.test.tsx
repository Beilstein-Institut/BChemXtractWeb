import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PubChemPreferencesProvider } from "@/context/PubChemPreferencesContext";
import { usePubChemPreferences } from "@/hooks/usePubChemPreferences";

function wrapper({ children }: { children: React.ReactNode }) {
  return <PubChemPreferencesProvider>{children}</PubChemPreferencesProvider>;
}

afterEach(() => localStorage.clear());

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
