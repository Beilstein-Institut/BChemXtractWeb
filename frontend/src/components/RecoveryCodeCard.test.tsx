/**
 * RecoveryCodeCard — unit tests.
 *
 * Verifies:
 *   - Renders the session UUID when `sessionId` is supplied.
 *   - Renders the loading placeholder when `isLoading` is true.
 *   - Renders "Unavailable" when sessionId is null and not loading.
 *   - Copy button writes to navigator.clipboard.writeText and flips the
 *     icon to a check for 2s.
 *   - Copy button is disabled when sessionId is null.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RecoveryCodeCard } from "./RecoveryCodeCard";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("RecoveryCodeCard", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the sessionId in the recovery code display", () => {
    render(<RecoveryCodeCard sessionId={SESSION_ID} isLoading={false} />);
    expect(screen.getByText(SESSION_ID)).toBeInTheDocument();
  });

  it("renders the Loading… placeholder while isLoading", () => {
    render(<RecoveryCodeCard sessionId={null} isLoading={true} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders 'Unavailable' when sessionId is null and not loading", () => {
    render(<RecoveryCodeCard sessionId={null} isLoading={false} />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });

  it("disables the Copy button when sessionId is null", () => {
    render(<RecoveryCodeCard sessionId={null} isLoading={false} />);
    const button = screen.getByRole("button", { name: /copy/i });
    expect(button).toBeDisabled();
  });

  it("calls navigator.clipboard.writeText with the session id on click", async () => {
    render(<RecoveryCodeCard sessionId={SESSION_ID} isLoading={false} />);
    const button = screen.getByRole("button", { name: /copy recovery code/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(SESSION_ID);
    });
  });

  it("flips the button label to 'Copied' after a successful copy", async () => {
    render(<RecoveryCodeCard sessionId={SESSION_ID} isLoading={false} />);
    const button = screen.getByRole("button", { name: /copy recovery code/i });
    fireEvent.click(button);

    await waitFor(() => {
      // aria-label flips from "Copy recovery code" → "Recovery code copied"
      // and visible text flips from "Copy" → "Copied".
      expect(screen.getByRole("button", { name: /recovery code copied/i })).toBeInTheDocument();
    });
  });
});
