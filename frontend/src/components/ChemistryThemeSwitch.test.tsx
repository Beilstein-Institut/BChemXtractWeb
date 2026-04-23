/**
 * ChemistryThemeSwitch — tests for the sky+flask fusion theme toggle (Task 17).
 *
 * The component is a plain `<label>` wrapping a hidden checkbox whose
 * state drives the ThemeProvider. Assertions cover the data-slot
 * contract, aria-label polarity, and Light↔Dark persistence through
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
  it("exposes data-slot=\"theme-switch\" on the root label", () => {
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

  it("announces 'Switch to dark mode' when in light mode", () => {
    renderWithProvider("light");
    expect(screen.getByLabelText("Switch to dark mode")).toBeInTheDocument();
  });

  it("announces 'Switch to light mode' when in dark mode", () => {
    renderWithProvider("dark");
    expect(screen.getByLabelText("Switch to light mode")).toBeInTheDocument();
  });

  it("applies the chem-toggle class cluster for the scoped CSS", () => {
    renderWithProvider();
    const root = document.querySelector('[data-slot="theme-switch"]');
    expect(root?.className).toContain("chem-toggle");
    expect(
      document.querySelector(".chem-toggle__container"),
    ).not.toBeNull();
    expect(document.querySelector(".flask")).not.toBeNull();
    expect(document.querySelector(".flask__body")).not.toBeNull();
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

  it("renders the scenery (stars + sun + moon + clouds)", () => {
    renderWithProvider();
    // 7 stars, 2 sun halves, 1 moon + 2 craters, 3 clouds.
    expect(document.querySelectorAll(".chem-toggle__star")).toHaveLength(7);
    expect(document.querySelector(".sun-primary")).not.toBeNull();
    expect(document.querySelector(".sun-secondary")).not.toBeNull();
    expect(document.querySelector(".moon")).not.toBeNull();
    expect(document.querySelector(".moon-crater-1")).not.toBeNull();
    expect(document.querySelector(".moon-crater-2")).not.toBeNull();
    expect(document.querySelectorAll(".chem-toggle__cloud")).toHaveLength(3);
  });
});
