/**
 * Tests for ChemistryThemeSwitch.
 *
 * The theme provider is mocked so tests can drive `theme` directly
 * without going through localStorage (which is a stub in this jsdom
 * setup, per ExperimentalBanner.test.tsx). window.matchMedia is also
 * mocked for the theme === "system" path — jsdom does not implement
 * it by default.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { ChemistryThemeSwitch } from "./ChemistryThemeSwitch";

const setTheme = vi.fn();
let currentTheme: "light" | "dark" | "system" = "light";

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: currentTheme, setTheme }),
}));

/**
 * Install a matchMedia mock that returns the given dark-mode state and
 * supports the addEventListener/removeEventListener API the hook uses.
 */
function mockMatchMedia(prefersDark: boolean) {
  const mql = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => mql,
  });
}

describe("ChemistryThemeSwitch", () => {
  beforeEach(() => {
    setTheme.mockReset();
    currentTheme = "light";
    mockMatchMedia(false);
  });

  it("renders a role=switch input", () => {
    render(<ChemistryThemeSwitch />);
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("is unchecked when theme='light'", () => {
    currentTheme = "light";
    render(<ChemistryThemeSwitch />);
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("is checked when theme='dark'", () => {
    currentTheme = "dark";
    render(<ChemistryThemeSwitch />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("theme='system' reflects matchMedia dark preference", () => {
    currentTheme = "system";
    mockMatchMedia(true); // OS prefers dark
    render(<ChemistryThemeSwitch />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("theme='system' with light OS preference renders unchecked", () => {
    currentTheme = "system";
    mockMatchMedia(false);
    render(<ChemistryThemeSwitch />);
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("clicking an unchecked switch calls setTheme('dark')", () => {
    currentTheme = "light";
    render(<ChemistryThemeSwitch />);
    fireEvent.click(screen.getByRole("switch"));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("clicking a checked switch calls setTheme('light')", () => {
    currentTheme = "dark";
    render(<ChemistryThemeSwitch />);
    fireEvent.click(screen.getByRole("switch"));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("exposes an aria-label that describes the target theme", () => {
    currentTheme = "light";
    const { rerender } = render(<ChemistryThemeSwitch />);
    expect(screen.getByLabelText(/switch to dark mode/i)).toBeInTheDocument();
    currentTheme = "dark";
    rerender(<ChemistryThemeSwitch />);
    expect(screen.getByLabelText(/switch to light mode/i)).toBeInTheDocument();
  });
});
