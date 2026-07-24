/**
 * Tests for ReactionCard component.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * Full-width horizontal card with combined reaction SVG, reaction SMILES,
 * short RInChI key, and component chip. Click opens sheet.
 *
 * SVG rendered via `<img src="blob:...">` produced by useSvgObjectUrl
 * (XSS mitigation) — never innerHTML.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { ReactionResponse } from "@/types/chemistry";

// Mock sonner toast — not exercised in these tests unless clipboard fails.
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

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

// Mock @base-ui/react/tooltip to avoid portal complexity in jsdom.
vi.mock("@base-ui/react/tooltip", () => {
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
        return React.createElement(React.Fragment, null, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Positioner: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Popup: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", { "data-testid": "tooltip-content" }, children),
      Arrow: () => null,
    },
  };
});

// Mock @base-ui/react/merge-props + use-render for Badge primitive.
// Badge primitive uses useRender — we let the real implementation run
// since it only operates on plain spans (no portal); default jsdom suffices.

// Mock navigator.clipboard with a jest/vi-compatible writeText function.
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  configurable: true,
  value: {
    writeText: vi.fn(),
  },
});

import { ReactionCard } from "./ReactionCard";

const mkReaction = (overrides: Partial<ReactionResponse> = {}): ReactionResponse => ({
  rinchi: "InChI=1S/RInChI",
  rinchi_key: "",
  short_rinchi_key: "QDQJI-UBKILYX-N",
  long_rinchi_key: "QDQJI-UBKILYX-long",
  web_rinchi_key: "QDQJI-UBKILYX-web",
  reaction_smiles: "CC>>CCO",
  aux_info: "",
  reactants: [
    {
      inchi: "",
      inchi_key: "",
      cdx_top: 0,
      cdx_left: 0,
      cdx_bottom: 0,
      cdx_right: 0,
    },
  ],
  products: [
    {
      inchi: "",
      inchi_key: "",
      cdx_top: 0,
      cdx_left: 0,
      cdx_bottom: 0,
      cdx_right: 0,
    },
  ],
  agents: [],
  svg: "<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>",
  ...overrides,
});

describe("ReactionCard component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("renders with role='button' + tabIndex + aria-label", () => {
    const onOpen = vi.fn();
    render(<ReactionCard reaction={mkReaction()} reactionIndex={0} onOpen={onOpen} />);
    const btn = screen.getByRole("button", {
      name: /View reaction details/i,
    });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("tabIndex", "0");
  });

  it("renders SVG via a Blob URL (T-10-05)", () => {
    render(<ReactionCard reaction={mkReaction()} reactionIndex={0} onOpen={vi.fn()} />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toMatch(/^blob:/);
  });

  it("renders 'Depiction unavailable' fallback when svg is empty (D-13)", () => {
    render(<ReactionCard reaction={mkReaction({ svg: "" })} reactionIndex={0} onOpen={vi.fn()} />);
    expect(screen.getByText("Depiction unavailable")).toBeInTheDocument();
  });

  it("renders reaction_smiles with copy button", () => {
    render(<ReactionCard reaction={mkReaction()} reactionIndex={0} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /copy reaction SMILES/i })).toBeInTheDocument();
  });

  it("copy button click calls writeText + stopPropagation so onOpen is NOT fired", () => {
    const onOpen = vi.fn();
    render(<ReactionCard reaction={mkReaction()} reactionIndex={0} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /copy reaction SMILES/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("CC>>CCO");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("renders short_rinchi_key with copy button", () => {
    render(<ReactionCard reaction={mkReaction()} reactionIndex={0} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /copy short RInChI key/i })).toBeInTheDocument();
  });

  it("component chip singularizes at count 1 ('1 reactant · 1 product', no agents segment)", () => {
    render(<ReactionCard reaction={mkReaction()} reactionIndex={0} onOpen={vi.fn()} />);
    expect(screen.getByText(/1 reactant · 1 product/)).toBeInTheDocument();
  });

  it("component chip includes agent segment when agents > 0", () => {
    render(
      <ReactionCard
        reaction={mkReaction({
          agents: [
            {
              inchi: "",
              inchi_key: "",
              cdx_top: 0,
              cdx_left: 0,
              cdx_bottom: 0,
              cdx_right: 0,
            },
          ],
        })}
        reactionIndex={0}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText(/1 agent/)).toBeInTheDocument();
  });

  it("card click invokes onOpen(reactionIndex)", () => {
    const onOpen = vi.fn();
    render(<ReactionCard reaction={mkReaction()} reactionIndex={3} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /View reaction details/i }));
    expect(onOpen).toHaveBeenCalledWith(3);
  });

  it("Enter key invokes onOpen; Space key too", () => {
    const onOpen = vi.fn();
    render(<ReactionCard reaction={mkReaction()} reactionIndex={5} onOpen={onOpen} />);
    const card = screen.getByRole("button", {
      name: /View reaction details/i,
    });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(5);
    fireEvent.keyDown(card, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
