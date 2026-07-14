/**
 * SearchInput — concrete tests for the global smart-box search input.
 *
 * Captures required behaviors: type badge + override, substructure =
 * explicit submit, and the `/` keyboard shortcut.
 *
 * Mocks base-ui primitives used by shadcn wrappers to avoid portal/animation
 * complexity in jsdom (same pattern as BrowseToolbar.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// Stub postSearch / postSearchValidate — we're testing UI behavior, not network.
vi.mock("@/lib/apiClient", () => ({
  postSearch: vi.fn(() =>
    Promise.resolve({
      results: [],
      total: 0,
      page: 1,
      size: 24,
      warnings: [],
    }),
  ),
  postSearchValidate: vi.fn(() =>
    Promise.resolve({
      valid: true,
      language: "smiles",
      atom_count: 1,
      error: null,
    }),
  ),
}));

// Mock @base-ui/react/popover — same shape as BrowseToolbar.test.tsx
vi.mock("@base-ui/react/popover", () => {
  const React = require("react");
  return {
    Popover: {
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Trigger: ({
        children,
        render: renderProp,
        ...rest
      }: {
        children?: React.ReactNode;
        render?: React.ReactElement;
        [key: string]: unknown;
      }) => {
        if (renderProp) {
          return React.cloneElement(renderProp, rest, children);
        }
        return React.createElement("button", rest, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Positioner: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Popup: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("div", { "data-testid": "popover-content", className }, children),
    },
  };
});

// Mock @base-ui/react/dialog — Sheet uses Dialog under the hood.
vi.mock("@base-ui/react/dialog", () => {
  const React = require("react");
  return {
    Dialog: {
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Trigger: ({
        children,
        render: renderProp,
        ...rest
      }: {
        children?: React.ReactNode;
        render?: React.ReactElement;
        [key: string]: unknown;
      }) => {
        if (renderProp) {
          return React.cloneElement(renderProp, rest, children);
        }
        return React.createElement("button", rest, children);
      },
      Close: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Backdrop: () => null,
      Popup: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("div", { "data-testid": "sheet-content", className }, children),
      Title: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("h2", null, children),
      Description: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("p", null, children),
    },
  };
});

// Mock @base-ui/react/button
vi.mock("@base-ui/react/button", () => {
  const React = require("react");
  return {
    Button: React.forwardRef(
      (
        { children, className, ...props }: React.ComponentProps<"button">,
        ref: React.Ref<HTMLButtonElement>,
      ) => React.createElement("button", { ref, className, ...props }, children),
    ),
  };
});

// Mock @base-ui/react/input — the shadcn Input primitive wraps this.
vi.mock("@base-ui/react/input", () => {
  const React = require("react");
  return {
    Input: React.forwardRef(
      (props: React.ComponentProps<"input">, ref: React.Ref<HTMLInputElement>) =>
        React.createElement("input", { ref, ...props }),
    ),
  };
});

// Mock @base-ui/react/use-render
vi.mock("@base-ui/react/use-render", () => ({
  useRender: ({
    props,
    defaultTagName,
  }: {
    props: Record<string, unknown>;
    defaultTagName: string;
  }) => {
    const React = require("react");
    return React.createElement(defaultTagName, props);
  },
}));

// Mock @base-ui/react/merge-props
vi.mock("@base-ui/react/merge-props", () => ({
  mergeProps: (...args: Record<string, unknown>[]) => Object.assign({}, ...args),
}));

// Import AFTER the mocks so the module graph picks them up.
import { SearchInput } from "@/components/SearchInput";
import { SearchProvider } from "@/context/SearchContext";
import { postSearch, postSearchValidate } from "@/lib/apiClient";

/**
 * Every render() must wrap the component in <SearchProvider> — useSearch
 * throws if called outside the provider.
 */
function renderWithProvider(ui: React.ReactElement) {
  return render(<SearchProvider>{ui}</SearchProvider>);
}

describe("SearchInput", () => {
  beforeEach(() => {
    // Reset URL state — useSearch seeds itself from `?q=` which otherwise
    // leaks the previous test's query into the next render.
    window.history.replaceState(null, "", "/");
  });

  it("renders placeholder", () => {
    renderWithProvider(<SearchInput />);
    expect(
      screen.getAllByPlaceholderText("Search by formula, SMILES, or InChIKey…").length,
    ).toBeGreaterThan(0);
  });

  it("focuses on `/` keydown from body", () => {
    renderWithProvider(<SearchInput />);
    // Desktop input is first; mobile sheet is hidden (md:hidden).
    const input = screen.getAllByPlaceholderText(
      "Search by formula, SMILES, or InChIKey…",
    )[0] as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(input);
  });

  it("does NOT focus on `/` when already inside an input", () => {
    renderWithProvider(
      <>
        <input data-testid="other" />
        <SearchInput />
      </>,
    );
    const other = screen.getByTestId("other") as HTMLInputElement;
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(document.activeElement).toBe(other);
  });

  it("clears + blurs on Escape", () => {
    renderWithProvider(<SearchInput />);
    const input = screen.getAllByPlaceholderText(
      "Search by formula, SMILES, or InChIKey…",
    )[0] as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "foo" } });
    expect(input.value).toBe("foo");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });

  it("shows type badge after ≥ 2 chars are typed (Formula detection)", () => {
    renderWithProvider(<SearchInput />);
    const input = screen.getAllByPlaceholderText(
      "Search by formula, SMILES, or InChIKey…",
    )[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "C6H6" } });
    expect(screen.getAllByText("Molecular formula").length).toBeGreaterThan(0);
  });

  it("does not render an inline Submit button — search fires automatically as the user types", () => {
    renderWithProvider(<SearchInput />);
    expect(screen.queryByRole("button", { name: "Submit search" })).toBeNull();
    const input = screen.getAllByPlaceholderText(
      "Search by formula, SMILES, or InChIKey…",
    )[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "C" } });
    expect(screen.queryByRole("button", { name: "Submit search" })).toBeNull();
  });

  it("detects a 14-char partial InChI key as type 'InChI key'", () => {
    renderWithProvider(<SearchInput />);
    const input = screen.getAllByPlaceholderText(
      "Search by formula, SMILES, or InChIKey…",
    )[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "JVTAAEKCZFNVCJ" } });
    // The badge's trigger button exposes the detected type via aria-label.
    // This pins the badge specifically — the popover radio list always
    // renders every TYPE_LABEL so `getAllByText("InChI key")` would match
    // even when detection returns "Formula".
    expect(
      screen.getAllByRole("button", {
        name: /Detected type: InChI key/,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("detects a 14-10 partial InChI key as type 'InChI key'", () => {
    renderWithProvider(<SearchInput />);
    const input = screen.getAllByPlaceholderText(
      "Search by formula, SMILES, or InChIKey…",
    )[0] as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: "JVTAAEKCZFNVCJ-REOHCLBHSA" },
    });
    expect(
      screen.getAllByRole("button", {
        name: /Detected type: InChI key/,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("pressing Enter inside the input fires a search request", () => {
    const mockPost = vi.mocked(postSearch);
    renderWithProvider(<SearchInput />);
    const input = screen.getAllByPlaceholderText(
      "Search by formula, SMILES, or InChIKey…",
    )[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "C6H6" } });
    mockPost.mockClear();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPost).toHaveBeenCalled();
  });
});

describe("SearchInput — stereo + validity", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.mocked(postSearchValidate).mockReset();
    vi.mocked(postSearchValidate).mockResolvedValue({
      valid: true,
      language: "smiles",
      atom_count: 1,
      error: null,
    });
  });

  it("stereo toggle appears in the type popover when type is substructure", () => {
    // Seed URL so useSearchImpl picks substructure type + a non-empty query
    // (badge only renders once the query has ≥2 chars).
    window.history.replaceState(null, "", "/?type=substructure&q=CCO");
    renderWithProvider(<SearchInput />);
    // The popover mock renders its content inline (no open gating), so the
    // "Match stereochemistry" checkbox is reachable via its aria-label.
    const toggles = screen.getAllByRole("checkbox", { name: /match stereochemistry/i });
    expect(toggles.length).toBeGreaterThan(0);
    // Default stereo is false → checkbox is unchecked.
    expect((toggles[0] as HTMLInputElement).checked).toBe(false);
    fireEvent.click(toggles[0]);
    expect((toggles[0] as HTMLInputElement).checked).toBe(true);
  });

  it("invalid substructure query shows a destructive validity badge", async () => {
    vi.mocked(postSearchValidate).mockResolvedValue({
      valid: false,
      language: null,
      atom_count: 0,
      error: "Unclosed ring",
    });
    window.history.replaceState(null, "", "/?type=substructure");
    renderWithProvider(<SearchInput />);
    const input = screen.getAllByPlaceholderText(
      "Search by formula, SMILES, or InChIKey…",
    )[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "c1ccc(((" } });
    // Wait for the 150ms validate debounce + promise resolution.
    await waitFor(
      () => {
        const triggers = screen.getAllByRole("button", { name: /Invalid query/i });
        expect(triggers.length).toBeGreaterThan(0);
      },
      { timeout: 1500 },
    );
    // The badge inside the trigger carries destructive styling so users can
    // see the parse failure at a glance.
    const trigger = screen.getAllByRole("button", { name: /Invalid query/i })[0];
    const badge = within(trigger).getByText("Invalid");
    expect(badge.className).toMatch(/destructive/);
  });

  it("valid substructure query shows a SMILES/SMARTS language badge", async () => {
    vi.mocked(postSearchValidate).mockResolvedValue({
      valid: true,
      language: "smarts",
      atom_count: 3,
      error: null,
    });
    window.history.replaceState(null, "", "/?type=substructure");
    renderWithProvider(<SearchInput />);
    const input = screen.getAllByPlaceholderText(
      "Search by formula, SMILES, or InChIKey…",
    )[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "[#6]=[#6]" } });
    await waitFor(
      () => {
        expect(screen.getAllByText("SMARTS").length).toBeGreaterThan(0);
      },
      { timeout: 1500 },
    );
  });
});
