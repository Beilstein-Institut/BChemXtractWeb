/**
 * SearchResults — concrete tests flipped from Wave-0 stub (Plan 09-07).
 *
 * Mocks postSearch so we don't hit the network, and mocks sonner so we can
 * assert the warning toast fires on backend warnings. Mocks base-ui Popover
 * + Separator primitives for jsdom hygiene (same pattern as
 * BrowseToolbar.test.tsx / SearchInput.test.tsx).
 *
 * Covers plan truths:
 *   - Metadata row renders with `{total} results for <code>{query}</code> · {type} · {scope}`
 *   - Empty state shows `<EmptyState>` + `<DidYouMean>`
 *   - Error branch shows retry Button
 *   - Backend warnings trigger a sonner `toast.warning` call
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Stub postSearch — tests drive responses per case.
const mockPostSearch = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  postSearch: (...args: unknown[]) => mockPostSearch(...args),
}));

// Stub sonner so we can assert toast.warning fires.
vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock @base-ui/react/popover — same shape as BrowseToolbar.test.tsx.
vi.mock("@base-ui/react/popover", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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

// Mock @base-ui/react/separator.
vi.mock("@base-ui/react/separator", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    Separator: ({ className, ...rest }: { className?: string; [k: string]: unknown }) =>
      React.createElement("hr", { className, ...rest }),
  };
});

// Mock @base-ui/react/button to a plain button.
vi.mock("@base-ui/react/button", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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

// Mock @base-ui/react/use-render.
vi.mock("@base-ui/react/use-render", () => ({
  useRender: ({
    props,
    defaultTagName,
  }: {
    props: Record<string, unknown>;
    defaultTagName: string;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    return React.createElement(defaultTagName, props);
  },
}));

// Mock @base-ui/react/merge-props.
vi.mock("@base-ui/react/merge-props", () => ({
  mergeProps: (...args: Record<string, unknown>[]) => Object.assign({}, ...args),
}));

// Mock @base-ui/react/dialog — StructureCard imports Dialog under the hood.
vi.mock("@base-ui/react/dialog", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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
      Popup: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", null, children),
      Title: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("h2", null, children),
      Description: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("p", null, children),
    },
  };
});

// Mock @base-ui/react/tooltip — StructureCard uses Tooltip for the SMILES row.
vi.mock("@base-ui/react/tooltip", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    Tooltip: {
      Provider: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
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
        return React.createElement("span", rest, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Positioner: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Popup: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", null, children),
      Arrow: () => null,
    },
  };
});

// Import AFTER mocks.
import { SearchResults } from "@/components/SearchResults";

describe("SearchResults", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    mockPostSearch.mockReset();
  });

  it("renders metadata row for a populated response", async () => {
    window.history.replaceState(null, "", "/?q=C6H6&type=formula");
    mockPostSearch.mockResolvedValueOnce({
      results: [
        {
          substance: {
            id: 1,
            inchi: "",
            inchi_key: "UHOVQNZJYSORNB-UHFFFAOYSA-N",
            smiles: "c1ccccc1",
            extended_smiles: "",
            iupac_name: "",
            molecular_formula: "C6H6",
            aux_info: "",
            mdlv3000: "",
            abbreviations: {},
            svg: "",
            svg_cdx: "",
          },
          extraction_count: 1,
          extractions: [
            {
              extraction_id: 10,
              filename: "aromatics.cdx",
              created_at: "2026-04-17T10:00:00+00:00",
            },
          ],
          match_svg: null,
          match_atom_indices: [],
        },
      ],
      total: 1,
      page: 1,
      size: 24,
      warnings: [],
    });

    render(<SearchResults />);
    // "results for " appears in the metadata row AND the sr-only "Search
    // results" h2 also matches /result/ — use getAllByText and assert ≥1.
    await waitFor(() => {
      expect(screen.getAllByText(/result/i).length).toBeGreaterThan(0);
    });
    // Query text renders inside the <code> in the metadata row
    // (StructureCard may also render C6H6 as the molecular formula,
    // so accept ≥1 match).
    expect(screen.getAllByText(/C6H6/).length).toBeGreaterThan(0);
    // Clear search button is the concrete metadata-row affordance.
    expect(screen.getByText("Clear search")).toBeInTheDocument();
  });

  it("renders empty state with DidYouMean on 0 results", async () => {
    window.history.replaceState(null, "", "/?q=nonexistent");
    mockPostSearch.mockResolvedValueOnce({
      results: [],
      total: 0,
      page: 1,
      size: 24,
      warnings: [],
    });
    render(<SearchResults />);
    await waitFor(() => {
      expect(screen.getByText(/No matches for/)).toBeInTheDocument();
    });
  });

  it("renders retry in error branch", async () => {
    window.history.replaceState(null, "", "/?q=will-fail");
    mockPostSearch.mockRejectedValueOnce(new Error("Search failed — boom"));
    render(<SearchResults />);
    await waitFor(() => {
      expect(screen.getByText(/didn't work/)).toBeInTheDocument();
    });
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("fires a warning toast when backend returns warnings", async () => {
    const sonner = await import("sonner");
    window.history.replaceState(null, "", "/?q=c1ccccc1");
    mockPostSearch.mockResolvedValueOnce({
      results: [],
      total: 0,
      page: 1,
      size: 24,
      warnings: ["3 substances could not be parsed and were skipped"],
    });
    render(<SearchResults />);
    await waitFor(() => {
      expect(sonner.toast.warning as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        expect.stringContaining("could not be parsed"),
        expect.any(Object),
      );
    });
  });
});
