/**
 * RestoreSessionForm — unit tests.
 *
 * Verifies:
 *   - The form rejects malformed UUID4 codes client-side (no fetch).
 *   - The form rejects valid-but-non-v4 UUIDs (version nibble check).
 *   - Submitting a canonical UUID4 POSTs to /api/auth/restore.
 *   - Submitting normalises input (trim + lowercase) so a mixed-case
 *     paste still passes validation.
 *   - Backend failure surfaces as an inline alert.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { csrfTokenCache } from "@/lib/csrfTokenCache";

import { RestoreSessionForm } from "./RestoreSessionForm";

const VALID_UUID4 = "22222222-2222-4222-8222-222222222222";

function mock204() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 204,
    json: () => Promise.resolve({}),
  } as Response);
}

describe("RestoreSessionForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    csrfTokenCache.value = "fake-token.123.sig";
  });

  afterEach(() => {
    csrfTokenCache.value = null;
  });

  it("rejects a malformed UUID code client-side without firing fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<RestoreSessionForm />);

    const input = screen.getByLabelText(/recovery code/i);
    fireEvent.change(input, { target: { value: "not-a-uuid" } });
    fireEvent.click(screen.getByRole("button", { name: /restore session/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/valid UUID4/i);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a v1 UUID (wrong version nibble) without firing fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<RestoreSessionForm />);

    // Canonical shape, but version nibble = 1 instead of 4.
    fireEvent.change(screen.getByLabelText(/recovery code/i), {
      target: { value: "22222222-2222-1222-8222-222222222222" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore session/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/valid UUID4/i);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs valid UUID4 to /api/auth/restore", async () => {
    const fetchSpy = mock204();
    // Stub reload so jsdom doesn't blow up after a successful submission.
    const reloadStub = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadStub },
    });

    render(<RestoreSessionForm />);
    fireEvent.change(screen.getByLabelText(/recovery code/i), {
      target: { value: VALID_UUID4 },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore session/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/auth/restore");
    expect((init as RequestInit).method).toBe("POST");
    expect(((init as RequestInit).body as string).includes(VALID_UUID4)).toBe(true);

    await waitFor(() => expect(reloadStub).toHaveBeenCalled());
  });

  it("normalises a mixed-case UUID before validating", async () => {
    const fetchSpy = mock204();
    const reloadStub = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadStub },
    });

    render(<RestoreSessionForm />);
    // Mixed case + leading/trailing whitespace — should still be accepted
    // and forwarded to the backend in canonical lowercase.
    fireEvent.change(screen.getByLabelText(/recovery code/i), {
      target: { value: "  AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore session/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const body = (fetchSpy.mock.calls[0][1] as RequestInit).body as string;
    expect(body).toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(body).not.toContain("AAAAAAAA");
  });

  it("surfaces backend errors inline (does not reload)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ detail: "session not found", code: "NOT_FOUND" }),
    } as Response);
    const reloadStub = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadStub },
    });

    render(<RestoreSessionForm />);
    fireEvent.change(screen.getByLabelText(/recovery code/i), {
      target: { value: VALID_UUID4 },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore session/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/session not found|restore failed/i);
    });
    expect(reloadStub).not.toHaveBeenCalled();
  });
});
