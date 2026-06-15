/**
 * ThemeProvider — class emission on <html>.
 *
 * The `neo-ui` / `hc` / `?ui=neo` URL-param machinery that used to live
 * here has been dropped. The provider is now scoped to a single concern: emit
 * `light` or `dark` on `<html>` based on:
 *   1. The `bchemxtract-theme` entry in localStorage (if set), or
 *   2. The `defaultTheme` prop fallback ("system" by default), or
 *   3. `prefers-color-scheme` when the resolved theme is "system".
 *
 * These tests exercise that contract.
 */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider } from "./theme-provider";

const STORAGE_KEY = "bchemxtract-theme";

function setPrefersColorScheme(isDark: boolean) {
  // Re-install matchMedia with a deterministic answer for the dark query.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? isDark : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  // Default everyone to a light system preference.
  setPrefersColorScheme(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThemeProvider class emission on <html>", () => {
  test("defaultTheme='light' emits `.light` on <html>", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("defaultTheme='dark' emits `.dark` on <html>", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  test("defaultTheme='system' + prefers-color-scheme:light emits `.light`", () => {
    setPrefersColorScheme(false);
    render(
      <ThemeProvider defaultTheme="system">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("defaultTheme='system' + prefers-color-scheme:dark emits `.dark`", () => {
    setPrefersColorScheme(true);
    render(
      <ThemeProvider defaultTheme="system">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  test("localStorage value 'dark' overrides defaultTheme='light'", () => {
    localStorage.setItem(STORAGE_KEY, "dark");
    render(
      <ThemeProvider defaultTheme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("localStorage value 'light' overrides defaultTheme='dark'", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    render(
      <ThemeProvider defaultTheme="dark">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  test("localStorage value 'system' resolves to `.dark` when prefers-color-scheme is dark", () => {
    setPrefersColorScheme(true);
    localStorage.setItem(STORAGE_KEY, "system");
    render(
      <ThemeProvider defaultTheme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("never emits the legacy `neo-ui` or `hc` classes", () => {
    localStorage.setItem(STORAGE_KEY, "dark");
    render(
      <ThemeProvider defaultTheme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("neo-ui")).toBe(false);
    expect(document.documentElement.classList.contains("hc")).toBe(false);
  });

  test("custom storageKey is respected", () => {
    localStorage.setItem("custom-theme-key", "dark");
    render(
      <ThemeProvider defaultTheme="light" storageKey="custom-theme-key">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
