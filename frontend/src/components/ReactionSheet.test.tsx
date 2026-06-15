/**
 * Tests for ReactionSheet component.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * Right-side detail sheet mirroring StructureSheet with reaction-specific
 * metadata + component groups + keyboard nav + zoom.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { ReactionComponentResponse, ReactionResponse } from "@/types/chemistry";

// Mock @base-ui/react/dialog — same shape StructureSheet.test.tsx uses.
vi.mock("@base-ui/react/dialog", () => {
  const React = require("react");
  return {
    Dialog: {
      Root: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
        open
          ? React.createElement(React.Fragment, null, children)
          : React.createElement(React.Fragment, null),
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
        return React.createElement(React.Fragment, null, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Backdrop: ({ className }: { className?: string }) =>
        React.createElement("div", {
          "data-testid": "dialog-backdrop",
          className,
        }),
      Popup: ({
        children,
        className,
        "aria-label": ariaLabel,
      }: {
        children: React.ReactNode;
        className?: string;
        "aria-label"?: string;
      }) =>
        React.createElement(
          "div",
          {
            "data-testid": "dialog-popup",
            role: "dialog",
            "aria-label": ariaLabel,
            className,
          },
          children,
        ),
      Close: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("button", { "data-testid": "dialog-close" }, children ?? null),
      Title: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("h2", { "data-testid": "dialog-title", className }, children),
      Description: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("p", { "data-testid": "dialog-description", className }, children),
    },
  };
});

// Mock @base-ui/react/button to a simple <button>.
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

// Mock sonner toast.
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock navigator.clipboard.
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  configurable: true,
  value: { writeText: vi.fn() },
});

import { ReactionSheet } from "./ReactionSheet";

const mkComponent = (
  overrides: Partial<ReactionComponentResponse> = {},
): ReactionComponentResponse => ({
  inchi: "InChI=1S/test",
  inchi_key: "KEY-ABC-N",
  cdx_top: 0,
  cdx_left: 0,
  cdx_bottom: 0,
  cdx_right: 0,
  ...overrides,
});

const mkReaction = (overrides: Partial<ReactionResponse> = {}): ReactionResponse => ({
  rinchi: "InChI=1S/RInChI",
  rinchi_key: "",
  short_rinchi_key: "Short-ABC",
  long_rinchi_key: "Long-ABC",
  web_rinchi_key: "Web-ABC",
  reaction_smiles: "CC>>CCO",
  aux_info: "aux-info",
  reactants: [
    mkComponent(),
    mkComponent({ inchi_key: "KEY-B" }),
    mkComponent({ inchi_key: "KEY-C" }),
  ],
  products: [mkComponent({ inchi_key: "KEY-P1" }), mkComponent({ inchi_key: "KEY-P2" })],
  agents: [],
  svg: "<svg xmlns='http://www.w3.org/2000/svg'/>",
  ...overrides,
});

type SheetProps = React.ComponentProps<typeof ReactionSheet>;

function renderSheet(overrides: Partial<SheetProps> = {}) {
  const props: SheetProps = {
    reaction: mkReaction(),
    reactionIndex: 2,
    totalCount: 12,
    open: true,
    onOpenChange: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    ...overrides,
  };
  return { ...render(<ReactionSheet {...props} />), props };
}

describe("ReactionSheet component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("renders with aria-label='Reaction detail'", () => {
    renderSheet();
    expect(screen.getByLabelText("Reaction detail")).toBeInTheDocument();
  });

  it("position label reads 'Reaction 3 of 12' (1-indexed)", () => {
    renderSheet();
    // "Reaction 3 of 12" appears both in the nav span and the SheetTitle.
    const hits = screen.getAllByText(/Reaction 3 of 12/);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("prev/next buttons have correct aria-labels", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: /Previous reaction/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next reaction/i })).toBeInTheDocument();
  });

  it("renders reaction identifier MetadataRows (SMILES/RInChI/keys/aux)", () => {
    renderSheet();
    expect(screen.getByText("SMILES")).toBeInTheDocument();
    expect(screen.getByText("RInChI")).toBeInTheDocument();
    expect(screen.getByText("RInChI Key (short)")).toBeInTheDocument();
    expect(screen.getByText("RInChI Key (long)")).toBeInTheDocument();
    expect(screen.getByText("RInChI Key (web)")).toBeInTheDocument();
    expect(screen.getByText("Aux Info")).toBeInTheDocument();
  });

  it("suppresses empty MetadataRows", () => {
    renderSheet({
      reaction: mkReaction({ aux_info: "", rinchi: "" }),
    });
    expect(screen.queryByText("Aux Info")).toBeNull();
    expect(screen.queryByText("RInChI")).toBeNull();
  });

  it("renders REACTANTS (3) heading", () => {
    renderSheet();
    expect(screen.getByText(/REACTANTS \(3\)/)).toBeInTheDocument();
  });

  it("renders PRODUCTS (2) heading", () => {
    renderSheet();
    expect(screen.getByText(/PRODUCTS \(2\)/)).toBeInTheDocument();
  });

  it("suppresses AGENTS group when agents.length === 0", () => {
    renderSheet();
    expect(screen.queryByText(/AGENTS/)).toBeNull();
  });

  it("renders AGENTS (1) when one agent present", () => {
    renderSheet({
      reaction: mkReaction({
        agents: [mkComponent({ inchi_key: "AGENT-KEY" })],
      }),
    });
    expect(screen.getByText(/AGENTS \(1\)/)).toBeInTheDocument();
  });

  it("ArrowLeft keydown calls onPrev", () => {
    const { props } = renderSheet();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(props.onPrev).toHaveBeenCalled();
  });

  it("ArrowRight keydown calls onNext", () => {
    const { props } = renderSheet();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(props.onNext).toHaveBeenCalled();
  });

  it("+ key increases zoom; - decreases; 0 resets", () => {
    renderSheet();
    expect(screen.getByText("100%")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "+" });
    expect(screen.getByText("125%")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "-" });
    expect(screen.getByText("100%")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "+" });
    fireEvent.keyDown(document, { key: "0" });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
