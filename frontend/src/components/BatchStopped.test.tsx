import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BatchStopped } from "./BatchStopped";

describe("BatchStopped", () => {
  it("shows the stopped message and a reload-to-extract instruction", () => {
    render(<BatchStopped onReset={vi.fn()} />);
    expect(screen.getByText("Batch stopped")).toBeDefined();
    expect(document.querySelector("[data-slot='batch-stopped']")?.textContent).toMatch(
      /discarded.*reload the page to extract new structures/i,
    );
  });

  it("New batch calls onReset", () => {
    const onReset = vi.fn();
    render(<BatchStopped onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /new batch/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("Reload page reloads the window", () => {
    const reload = vi.fn();
    // jsdom's location.reload isn't configurable directly; stub via defineProperty.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    render(<BatchStopped onReset={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /reload page/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
