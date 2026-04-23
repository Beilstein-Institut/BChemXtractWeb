/**
 * Tests for WizardStepper — Phase 3 Task 8.
 *
 * Covers:
 *   - derived status (complete / active / pending) per step
 *   - keyboard navigation (ArrowRight / ArrowLeft / Home / End)
 *   - click-to-change delegation
 *   - children rendered in the content slot
 *
 * Vitest globals enabled; describe/it/expect implicit.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

import { WizardStepper, type WizardStep } from "./WizardStepper";

const THREE_STEPS: WizardStep[] = [
  { id: "upload", label: "Upload" },
  { id: "extract", label: "Extract" },
  { id: "review", label: "Review" },
];

describe("WizardStepper", () => {
  it("renders data-slot='wizard-stepper' with the current step id", () => {
    render(
      <WizardStepper steps={THREE_STEPS} currentStep="extract">
        <p>body</p>
      </WizardStepper>,
    );
    const root = document.querySelector('[data-slot="wizard-stepper"]') as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root!.dataset.current).toBe("extract");
  });

  it("assigns status=complete/active/pending to steps relative to currentStep", () => {
    render(<WizardStepper steps={THREE_STEPS} currentStep="extract" />);
    const steps = document.querySelectorAll('[data-slot="wizard-step"]') as NodeListOf<HTMLElement>;
    expect(steps).toHaveLength(3);
    expect(steps[0].dataset.status).toBe("complete");
    expect(steps[0].dataset.stepId).toBe("upload");
    expect(steps[1].dataset.status).toBe("active");
    expect(steps[1].dataset.stepId).toBe("extract");
    expect(steps[2].dataset.status).toBe("pending");
    expect(steps[2].dataset.stepId).toBe("review");
  });

  it("marks the active step with aria-current='step'", () => {
    render(<WizardStepper steps={THREE_STEPS} currentStep="extract" />);
    const steps = document.querySelectorAll('[data-slot="wizard-step"]') as NodeListOf<HTMLElement>;
    expect(steps[0].getAttribute("aria-current")).toBeNull();
    expect(steps[1].getAttribute("aria-current")).toBe("step");
    expect(steps[2].getAttribute("aria-current")).toBeNull();
  });

  it("connectors before/at the active step are complete, after are not", () => {
    render(<WizardStepper steps={THREE_STEPS} currentStep="extract" />);
    const connectors = document.querySelectorAll(
      '[data-slot="wizard-connector"]',
    ) as NodeListOf<HTMLElement>;
    // 3 steps → 2 connectors.
    expect(connectors).toHaveLength(2);
    // Left-of-active step is "complete", so its connector flags complete.
    expect(connectors[0].dataset.complete).toBe("true");
    // Active → pending connector is NOT complete.
    expect(connectors[1].dataset.complete).toBeUndefined();
  });

  it("invokes onStepChange when a step button is clicked", () => {
    const onStepChange = vi.fn();
    render(<WizardStepper steps={THREE_STEPS} currentStep="extract" onStepChange={onStepChange} />);
    const review = document.querySelector('[data-step-id="review"]') as HTMLElement;
    fireEvent.click(review);
    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange).toHaveBeenCalledWith("review");
  });

  it("clicking the already-active step does NOT fire onStepChange", () => {
    const onStepChange = vi.fn();
    render(<WizardStepper steps={THREE_STEPS} currentStep="extract" onStepChange={onStepChange} />);
    const extract = document.querySelector('[data-step-id="extract"]') as HTMLElement;
    fireEvent.click(extract);
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it("ArrowRight advances to the next step", () => {
    const onStepChange = vi.fn();
    render(<WizardStepper steps={THREE_STEPS} currentStep="extract" onStepChange={onStepChange} />);
    const list = screen.getByRole("list", { name: /wizard steps/i });
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onStepChange).toHaveBeenCalledWith("review");
  });

  it("ArrowLeft moves to the previous step", () => {
    const onStepChange = vi.fn();
    render(<WizardStepper steps={THREE_STEPS} currentStep="extract" onStepChange={onStepChange} />);
    const list = screen.getByRole("list", { name: /wizard steps/i });
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(onStepChange).toHaveBeenCalledWith("upload");
  });

  it("ArrowLeft at the first step is a no-op (no onStepChange)", () => {
    const onStepChange = vi.fn();
    render(<WizardStepper steps={THREE_STEPS} currentStep="upload" onStepChange={onStepChange} />);
    const list = screen.getByRole("list", { name: /wizard steps/i });
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it("ArrowRight at the last step is a no-op", () => {
    const onStepChange = vi.fn();
    render(<WizardStepper steps={THREE_STEPS} currentStep="review" onStepChange={onStepChange} />);
    const list = screen.getByRole("list", { name: /wizard steps/i });
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it("Home jumps to the first step; End jumps to the last", () => {
    const onStepChange = vi.fn();
    render(<WizardStepper steps={THREE_STEPS} currentStep="extract" onStepChange={onStepChange} />);
    const list = screen.getByRole("list", { name: /wizard steps/i });
    fireEvent.keyDown(list, { key: "Home" });
    expect(onStepChange).toHaveBeenLastCalledWith("upload");
    fireEvent.keyDown(list, { key: "End" });
    expect(onStepChange).toHaveBeenLastCalledWith("review");
  });

  it("renders children below the indicator in a content slot", () => {
    render(
      <WizardStepper steps={THREE_STEPS} currentStep="upload">
        <p data-testid="body">content</p>
      </WizardStepper>,
    );
    const content = document.querySelector('[data-slot="wizard-content"]') as HTMLElement;
    expect(content).not.toBeNull();
    expect(content.querySelector('[data-testid="body"]')).not.toBeNull();
  });

  it("renders each step's icon when provided", () => {
    const steps: WizardStep[] = [
      { id: "a", label: "A", icon: <svg data-testid="icon-a" /> },
      { id: "b", label: "B" },
    ];
    render(<WizardStepper steps={steps} currentStep="a" />);
    expect(screen.getByTestId("icon-a")).toBeInTheDocument();
    // second step shows its 1-based index (2) as fallback text.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does nothing when onStepChange is missing and a key is pressed", () => {
    // smoke test: no consumer → no crash.
    render(<WizardStepper steps={THREE_STEPS} currentStep="extract" />);
    const list = screen.getByRole("list", { name: /wizard steps/i });
    expect(() => fireEvent.keyDown(list, { key: "ArrowRight" })).not.toThrow();
  });
});
