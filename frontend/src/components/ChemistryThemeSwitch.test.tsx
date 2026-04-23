/**
 * ChemistryThemeSwitch — tests for the sky-slider + flask hybrid
 * toggle. The component is a plain `<label>` wrapping a hidden
 * checkbox whose state drives the ThemeProvider. Assertions cover
 * the data-slot contract, aria-label polarity, the DOM shape
 * (theme-switch__container / __clouds / __stars-container /
 * __circle-container / __sun-moon-container with the flask
 * inside), and Light↔Dark persistence through
 * localStorage.bchemxtract-theme.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "./theme-provider";
import { ChemistryThemeSwitch } from "./ChemistryThemeSwitch";

function renderWithProvider(defaultTheme: "light" | "dark" | "system" = "light") {
  return render(
    <ThemeProvider defaultTheme={defaultTheme} storageKey="bchemxtract-theme">
      <ChemistryThemeSwitch />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});

describe("ChemistryThemeSwitch", () => {
  it('exposes data-slot="theme-switch" on the root label', () => {
    renderWithProvider();
    const root = document.querySelector('[data-slot="theme-switch"]');
    expect(root).not.toBeNull();
    expect(root?.tagName.toLowerCase()).toBe("label");
  });

  it("renders a hidden checkbox with role=switch", () => {
    renderWithProvider();
    const checkbox = screen.getByRole("switch");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.getAttribute("type")).toBe("checkbox");
  });

  it("announces 'Switch to dark theme' when in light mode", () => {
    renderWithProvider("light");
    expect(screen.getByLabelText("Switch to dark theme")).toBeInTheDocument();
  });

  it("announces 'Switch to light theme' when in dark mode", () => {
    renderWithProvider("dark");
    expect(screen.getByLabelText("Switch to light theme")).toBeInTheDocument();
  });

  it("applies the theme-switch class cluster for the scoped CSS", () => {
    renderWithProvider();
    const root = document.querySelector('[data-slot="theme-switch"]');
    expect(root?.className).toContain("theme-switch");
    expect(document.querySelector(".theme-switch__container")).not.toBeNull();
    expect(document.querySelector(".theme-switch__clouds")).not.toBeNull();
    expect(document.querySelector(".theme-switch__stars-container")).not.toBeNull();
    expect(document.querySelector(".theme-switch__circle-container")).not.toBeNull();
    expect(document.querySelector(".theme-switch__sun-moon-container")).not.toBeNull();
  });

  it("embeds the flask inside the sun-moon container (not as a sibling)", () => {
    renderWithProvider();
    const slot = document.querySelector(".theme-switch__sun-moon-container");
    expect(slot).not.toBeNull();
    const flask = slot?.querySelector(".flask");
    expect(flask).not.toBeNull();
    expect(document.querySelector(".flask__neck")).not.toBeNull();
    expect(document.querySelector(".flask__body")).not.toBeNull();
  });

  it("renders the flask neck container with exactly two vapor puffs", () => {
    renderWithProvider();
    expect(document.querySelector(".flask__neck-container")).not.toBeNull();
    expect(document.querySelectorAll(".flask__vapor").length).toBe(2);
  });

  it("does not render the original standalone scenery (stars, sun, moon, cloud divs)", () => {
    renderWithProvider();
    expect(document.querySelectorAll(".chem-toggle__star").length).toBe(0);
    expect(document.querySelector(".sun-primary")).toBeNull();
    expect(document.querySelector(".sun-secondary")).toBeNull();
    expect(document.querySelector(".moon")).toBeNull();
    expect(document.querySelector(".moon-crater-1")).toBeNull();
    expect(document.querySelector(".moon-crater-2")).toBeNull();
    expect(document.querySelectorAll(".chem-toggle__cloud").length).toBe(0);
  });

  it("toggling the checkbox from light persists 'dark' to localStorage", () => {
    renderWithProvider("light");
    const checkbox = screen.getByRole("switch") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(localStorage.getItem("bchemxtract-theme")).toBe("dark");
  });

  it("toggling the checkbox from dark persists 'light' to localStorage", () => {
    renderWithProvider("dark");
    const checkbox = screen.getByRole("switch") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(localStorage.getItem("bchemxtract-theme")).toBe("light");
  });

  it("flipping to dark adds the .dark class on <html>", () => {
    renderWithProvider("light");
    const checkbox = screen.getByRole("switch") as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("aria-label flips polarity after the user toggles to dark", () => {
    renderWithProvider("light");
    const checkbox = screen.getByRole("switch") as HTMLInputElement;
    expect(screen.getByLabelText("Switch to dark theme")).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(screen.getByLabelText("Switch to light theme")).toBeInTheDocument();
  });
});
