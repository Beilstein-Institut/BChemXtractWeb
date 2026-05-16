/**
 * SettingsPage — integration tests for Phase 11 D-07.
 *
 * Verifies:
 *   - useAuth() bootstrap resolves and the session UUID surfaces in the
 *     RecoveryCodeCard.
 *   - All three sections (recovery / restore / delete) render.
 *   - The Restore form rejects malformed UUIDs client-side (no fetch fires).
 *
 * Mocks `globalThis.fetch` directly because both `useAuth.putAuthMe` and the
 * Restore form's `postAuthRestore` go through apiClient.apiFetch which calls
 * `fetch`. We also seed `csrfTokenCache` with a fake token so apiFetch
 * happily injects the X-CSRF-Token header on the PUT /api/auth/me boot call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { csrfTokenCache } from "@/lib/csrfTokenCache";

import { SettingsPage } from "./SettingsPage";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function mockAuthMe(sessionId = SESSION_ID, hasHistory = false) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ session_id: sessionId, has_history: hasHistory }),
  } as Response);
}

describe("SettingsPage (Phase 11 D-07)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    csrfTokenCache.value = "fake-token.123.sig";
  });

  afterEach(() => {
    csrfTokenCache.value = null;
  });

  it("renders the session id once useAuth resolves", async () => {
    mockAuthMe();
    render(<SettingsPage />);

    expect(await screen.findByText(SESSION_ID)).toBeInTheDocument();
  });

  it("renders all three sections (recovery / restore / delete)", async () => {
    mockAuthMe();
    render(<SettingsPage />);

    // useAuth state lands before we assert the sections so we don't race
    // against the "Loading…" placeholder.
    await screen.findByText(SESSION_ID);

    // CardTitle elements aren't heading semantics — they're <div> with
    // data-slot="card-title". Match the unique slotted titles via slot
    // selectors which are stable across the bento layout.
    expect(
      document.querySelector('[data-slot="recovery-code-card"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="restore-session-form"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="delete-my-data-card"]'),
    ).toBeInTheDocument();
    // The destructive trigger button is independently present.
    expect(
      screen.getByRole("button", { name: /delete all my data/i }),
    ).toBeInTheDocument();
  });

  it("rejects malformed UUID4 codes on submit without firing a network call", async () => {
    const fetchSpy = mockAuthMe();
    render(<SettingsPage />);
    await screen.findByText(SESSION_ID);
    // One call so far: PUT /api/auth/me from useAuth bootstrap.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const input = screen.getByLabelText(/recovery code \(uuid4\)/i) as HTMLInputElement;
    const submit = screen.getByRole("button", { name: /restore session/i });

    fireEvent.change(input, { target: { value: "not-a-uuid" } });
    fireEvent.click(submit);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/valid UUID4/i);
    });
    // Crucially: no extra fetch call — the client-side validation short-
    // circuited before postAuthRestore could fire.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("accepts a valid UUID4 and POSTs to /api/auth/restore", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      // First call: useAuth bootstrap.
      if (typeof url === "string" && url.endsWith("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session_id: SESSION_ID, has_history: false }),
        } as Response);
      }
      // Second call: POST /api/auth/restore → 204 no body. The Restore
      // form does `window.location.reload()` on success which jsdom doesn't
      // actually navigate, but we never read the response body so an empty
      // 204 mock is fine.
      return Promise.resolve({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
      } as Response);
    });

    // Stub reload so the test doesn't blow up on jsdom's navigation guard.
    const reloadStub = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadStub },
    });

    render(<SettingsPage />);
    await screen.findByText(SESSION_ID);

    const input = screen.getByLabelText(/recovery code \(uuid4\)/i) as HTMLInputElement;
    const submit = screen.getByRole("button", { name: /restore session/i });

    fireEvent.change(input, {
      target: { value: "22222222-2222-4222-8222-222222222222" },
    });
    fireEvent.click(submit);

    await waitFor(() => {
      const restoreCall = fetchSpy.mock.calls.find(
        ([url]) => typeof url === "string" && url.endsWith("/api/auth/restore"),
      );
      expect(restoreCall).toBeDefined();
    });

    // Reload fires after the successful 204.
    await waitFor(() => expect(reloadStub).toHaveBeenCalled());
  });
});
