/**
 * DeleteMyDataButton — unit tests for GDPR Article 17.
 *
 * Verifies:
 *   - Renders the destructive trigger button.
 *   - Clicking the trigger opens the AlertDialog with a confirmation
 *     description.
 *   - Clicking Cancel closes the dialog without firing the network call.
 *   - Clicking Delete everything calls DELETE /api/me/data via the
 *     apiClient helper.
 *   - Backend errors are surfaced inline; reload is not fired.
 *   - Successful deletion triggers a full reload (cookie has been cleared
 *     by the backend, so the next render bootstraps a fresh session).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { csrfTokenCache } from "@/lib/csrfTokenCache";

import { DeleteMyDataButton } from "./DeleteMyDataButton";

function mockDelete204() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 204,
    json: () => Promise.resolve({}),
  } as Response);
}

describe("DeleteMyDataButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    csrfTokenCache.value = "fake-token.123.sig";
  });

  afterEach(() => {
    csrfTokenCache.value = null;
  });

  it("renders the destructive trigger button", () => {
    render(<DeleteMyDataButton />);
    const trigger = screen.getByRole("button", { name: /delete all my data/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute("data-variant")).toBe("destructive");
  });

  it("opens the confirmation dialog on trigger click", async () => {
    render(<DeleteMyDataButton />);
    fireEvent.click(screen.getByRole("button", { name: /delete all my data/i }));

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
    expect(screen.getByText(/permanently erases every extraction/i)).toBeInTheDocument();
  });

  it("closes the dialog on Cancel without firing the network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<DeleteMyDataButton />);
    fireEvent.click(screen.getByRole("button", { name: /delete all my data/i }));

    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /keep data/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("DELETEs /api/me/data when the user confirms", async () => {
    const fetchSpy = mockDelete204();
    const reloadStub = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadStub },
    });

    render(<DeleteMyDataButton />);
    fireEvent.click(screen.getByRole("button", { name: /delete all my data/i }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /delete everything/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/me/data");
    expect((init as RequestInit).method).toBe("DELETE");

    await waitFor(() => expect(reloadStub).toHaveBeenCalled());
  });

  it("surfaces backend errors inline without reloading", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ detail: "internal error", code: "DB_ERROR" }),
    } as Response);
    const reloadStub = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadStub },
    });

    render(<DeleteMyDataButton />);
    fireEvent.click(screen.getByRole("button", { name: /delete all my data/i }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /delete everything/i }));

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      const inline = alerts.find((el) =>
        /internal error|delete failed/i.test(el.textContent ?? ""),
      );
      expect(inline).toBeDefined();
    });
    expect(reloadStub).not.toHaveBeenCalled();
  });
});
