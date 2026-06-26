import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "@/lib/clipboard";

afterEach(() => {
  vi.restoreAllMocks();
  // Reset the Clipboard API + execCommand stubs between cases. jsdom defines
  // neither by default, so we attach our own and clear them here.
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  Reflect.deleteProperty(document, "execCommand");
});

function stubExecCommand(returns: boolean) {
  const exec = vi.fn().mockReturnValue(returns);
  // jsdom has no execCommand, so define it rather than spy on it.
  Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
  return exec;
}

describe("copyText", () => {
  it("uses navigator.clipboard in a secure context (sanitised payload)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await copyText("hello\nworld");

    // safeClipboardText strips the newline before it reaches the clipboard.
    expect(writeText).toHaveBeenCalledWith("helloworld");
  });

  it("falls back to execCommand when the Clipboard API is absent (plain HTTP)", async () => {
    const exec = stubExecCommand(true);

    await copyText("abc");

    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("falls back when navigator.clipboard.writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const exec = stubExecCommand(true);

    await copyText("abc");

    expect(writeText).toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("throws when the legacy copy is rejected by the browser", async () => {
    stubExecCommand(false);
    await expect(copyText("abc")).rejects.toThrow();
  });

  it("throws on an empty / control-only value without touching the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    // safeClipboardText strips CR/LF/NUL, leaving nothing to copy.
    await expect(copyText("\r\n")).rejects.toThrow();
    expect(writeText).not.toHaveBeenCalled();
  });
});
