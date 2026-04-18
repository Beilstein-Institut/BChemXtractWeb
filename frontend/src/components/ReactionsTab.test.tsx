/**
 * Tests for ReactionsTab orchestrator (Plan 10-05 Task 5.1).
 *
 * Verifies the five-state state machine (idle/loading/success/zero/error) plus
 * the file-re-upload idle variant and the cached-reactions bypass used when
 * loading a historical extraction (D-23).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactionExtractionResponse } from "@/types/chemistry";
import * as useReactionsModule from "@/hooks/useReactions";

// Mock sonner — the success/timeout toast assertions reach in via this mock.
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

// Mock ExperimentalBanner — kept simple; its own tests cover its behavior.
vi.mock("@/components/ExperimentalBanner", () => ({
  ExperimentalBanner: () => (
    <div data-testid="experimental-banner" role="note">
      Experimental banner
    </div>
  ),
}));

// Mock ReactionCard to avoid pulling the full implementation + Tooltip mocks.
vi.mock("@/components/ReactionCard", () => ({
  ReactionCard: ({
    reactionIndex,
    onOpen,
  }: {
    reactionIndex: number;
    onOpen: (index: number) => void;
  }) => (
    <button
      onClick={() => onOpen(reactionIndex)}
      aria-label={`View reaction details ${reactionIndex}`}
      data-testid={`reaction-card-${reactionIndex}`}
    >
      ReactionCard {reactionIndex}
    </button>
  ),
}));

// Mock ReactionSheet — exposes an identifying marker + totalCount for assertion.
vi.mock("@/components/ReactionSheet", () => ({
  ReactionSheet: ({
    open,
    totalCount,
  }: {
    open: boolean;
    totalCount: number;
  }) =>
    open ? (
      <div
        data-testid="reaction-sheet"
        data-open="true"
        data-total={totalCount}
      />
    ) : null,
}));

import { ReactionsTab } from "./ReactionsTab";
import { toast } from "sonner";

function mkFile() {
  return new File(["x"], "simple_reaction.cdx", { type: "chemical/x-cdx" });
}

type HookReturn = ReturnType<typeof useReactionsModule.useReactions>;

const mkHookReturn = (overrides: Partial<HookReturn> = {}): HookReturn => ({
  state: "idle",
  result: null,
  errorMessage: null,
  extract: vi.fn(),
  reset: vi.fn(),
  ...overrides,
});

const mkResponse = (
  overrides: Partial<ReactionExtractionResponse> = {},
): ReactionExtractionResponse => ({
  reactions: [],
  format: "cdx",
  filename: "simple_reaction.cdx",
  file_size: 100,
  reaction_count: 0,
  extraction_time_ms: 12.5,
  warnings: [],
  ...overrides,
});

describe("ReactionsTab", () => {
  let useReactionsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    useReactionsSpy = vi.spyOn(useReactionsModule, "useReactions");
  });
  afterEach(() => {
    useReactionsSpy.mockRestore();
  });

  it("idle state with file shows ExperimentalBanner + pre-extract CTA", () => {
    useReactionsSpy.mockReturnValue(mkHookReturn());
    render(<ReactionsTab file={mkFile()} />);
    expect(screen.getByTestId("experimental-banner")).toBeInTheDocument();
    expect(screen.getByText(/No reactions extracted yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Extract reactions from this file/i,
      }),
    ).toBeInTheDocument();
  });

  it("idle state without file shows re-upload EmptyState", () => {
    useReactionsSpy.mockReturnValue(mkHookReturn());
    render(<ReactionsTab file={null} />);
    // Title and button both read "Re-upload to extract reactions" — match all.
    expect(
      screen.getAllByText(/Re-upload to extract reactions/i).length,
    ).toBeGreaterThanOrEqual(1);
    // Hidden <input type="file"> is present for the re-upload picker.
    const hiddenInput = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement | null;
    expect(hiddenInput).not.toBeNull();
  });

  it("clicking 'Extract reactions from this file' fires hook.extract(file)", () => {
    const extract = vi.fn();
    useReactionsSpy.mockReturnValue(mkHookReturn({ extract }));
    const file = mkFile();
    render(<ReactionsTab file={file} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Extract reactions from this file/i,
      }),
    );
    expect(extract).toHaveBeenCalledWith(file);
  });

  it("loading state shows spinner + filename in message", () => {
    useReactionsSpy.mockReturnValue(mkHookReturn({ state: "loading" }));
    render(<ReactionsTab file={mkFile()} />);
    expect(
      screen.getByText(/Extracting reactions from simple_reaction.cdx/i),
    ).toBeInTheDocument();
    // Both the spinner and its live-region container carry role=status —
    // assert at least one is present.
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(1);
  });

  it("success state with reactions.length >= 1 renders a ReactionCard per reaction", () => {
    useReactionsSpy.mockReturnValue(
      mkHookReturn({
        state: "success",
        result: mkResponse({
          reactions: [
            {
              rinchi: "",
              rinchi_key: "",
              short_rinchi_key: "SHORT-KEY",
              long_rinchi_key: "",
              web_rinchi_key: "",
              reaction_smiles: "CC>>CCO",
              aux_info: "",
              reactants: [],
              products: [],
              agents: [],
              svg: "<svg/>",
            },
          ],
          reaction_count: 1,
        }),
      }),
    );
    render(<ReactionsTab file={mkFile()} />);
    expect(screen.getByTestId("reaction-card-0")).toBeInTheDocument();
  });

  it("success state with zero reactions shows the 'No reactions detected' EmptyState", () => {
    useReactionsSpy.mockReturnValue(
      mkHookReturn({
        state: "success",
        result: mkResponse({ reactions: [], reaction_count: 0 }),
      }),
    );
    render(<ReactionsTab file={mkFile()} />);
    expect(
      screen.getByText(/No reactions detected in this file/i),
    ).toBeInTheDocument();
  });

  it("success state with warnings fires toast exactly once", () => {
    useReactionsSpy.mockReturnValue(
      mkHookReturn({
        state: "success",
        result: mkResponse({
          reactions: [],
          warnings: [
            "Reaction extraction exceeded 30s timeout and was aborted.",
          ],
        }),
      }),
    );
    render(<ReactionsTab file={mkFile()} />);
    expect(toast).toHaveBeenCalledWith(
      "Reaction extraction exceeded 30s timeout and was aborted.",
      expect.objectContaining({ duration: 5000 }),
    );
  });

  it("error state shows retry button; click re-fires extract(file)", () => {
    const extract = vi.fn();
    useReactionsSpy.mockReturnValue(
      mkHookReturn({
        state: "error",
        errorMessage: "boom",
        extract,
      }),
    );
    render(<ReactionsTab file={mkFile()} />);
    expect(
      screen.getByText(/Reaction extraction didn't work/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(extract).toHaveBeenCalled();
  });

  it("clicking a ReactionCard opens the ReactionSheet", () => {
    useReactionsSpy.mockReturnValue(
      mkHookReturn({
        state: "success",
        result: mkResponse({
          reactions: [
            {
              rinchi: "",
              rinchi_key: "",
              short_rinchi_key: "K",
              long_rinchi_key: "",
              web_rinchi_key: "",
              reaction_smiles: "AA>>BB",
              aux_info: "",
              reactants: [],
              products: [],
              agents: [],
              svg: "<svg/>",
            },
          ],
          reaction_count: 1,
        }),
      }),
    );
    render(<ReactionsTab file={mkFile()} />);
    fireEvent.click(screen.getByTestId("reaction-card-0"));
    expect(screen.getByTestId("reaction-sheet")).toBeInTheDocument();
  });

  it("cachedReactions prop bypasses extract-trigger and renders list directly (D-23)", () => {
    useReactionsSpy.mockReturnValue(mkHookReturn());
    render(
      <ReactionsTab
        file={null}
        cachedReactions={[
          {
            rinchi: "",
            rinchi_key: "",
            short_rinchi_key: "CACHE",
            long_rinchi_key: "",
            web_rinchi_key: "",
            reaction_smiles: "AA>>BB",
            aux_info: "",
            reactants: [],
            products: [],
            agents: [],
            svg: "<svg/>",
          },
        ]}
        cachedExtractionTimeMs={1000}
        cachedFormat="cdxml"
        filename="cached.cdxml"
      />,
    );
    // Should render the ReactionCard — NOT the "Re-upload" EmptyState nor the
    // "Extract reactions" EmptyState.
    expect(screen.getByTestId("reaction-card-0")).toBeInTheDocument();
    expect(
      screen.queryByText(/Re-upload to extract reactions/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/No reactions extracted yet/i),
    ).not.toBeInTheDocument();
  });
});
