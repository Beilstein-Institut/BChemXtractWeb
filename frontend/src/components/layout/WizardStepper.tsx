import type { KeyboardEvent, ReactNode } from "react";
import { useCallback } from "react";

import { cn } from "@/lib/utils";

/**
 * WizardStepper — Liquid Glass rebuild.
 *
 * Top-of-page step indicator: a horizontal sequence of numbered pills
 * joined by thin connector lines, followed by a content slot below.
 * The Extract page wizard composes on top of this.
 *
 * Visual contract:
 *   - pending  → `bg-surface-muted text-foreground-muted` pill
 *   - active   → `bg-primary text-primary-foreground` pill (crimson)
 *   - complete → `bg-secondary text-secondary-foreground` pill (teal)
 *   - connector between completed / active steps inherits the higher of
 *     the two adjacent states (teal if both complete, teal->crimson
 *     gradient not attempted — we use teal when the left side is
 *     complete, muted otherwise).
 *
 * Keyboard navigation: focusing the stepper root and pressing
 *   - ArrowRight → advance to the next step (consumer decides via
 *     `onStepChange` whether to gate past not-yet-unlocked steps).
 *   - ArrowLeft  → move to the previous step.
 *   - Home / End → jump to first / last (UX nicety; inexpensive and
 *     discoverable).
 *
 * `data-slot="wizard-stepper"` on the root; each step button is
 * `data-slot="wizard-step"` with `data-status={pending|active|complete}`
 * so tests and selectors can observe transitions without snooping on
 * Tailwind classes.
 */

export type WizardStepStatus = "pending" | "active" | "complete";

export interface WizardStep {
  /** Stable identifier passed to `onStepChange`. */
  id: string;
  /** Human-readable label rendered next to / below the step pill. */
  label: string;
  /** Optional icon; falls back to the step index (1-based). */
  icon?: ReactNode;
}

interface WizardStepperProps {
  steps: WizardStep[];
  /** ID of the currently active step. Must match a `steps[n].id`. */
  currentStep: string;
  /** Fired when the user navigates (click or keyboard). */
  onStepChange?: (id: string) => void;
  /** Content slot rendered below the indicator. */
  children?: ReactNode;
  className?: string;
}

function computeStatus(index: number, activeIndex: number): WizardStepStatus {
  if (index < activeIndex) return "complete";
  if (index === activeIndex) return "active";
  return "pending";
}

const PILL_STATUS_CLASSES: Record<WizardStepStatus, string> = {
  pending: "bg-surface-muted text-foreground-muted ring-border",
  active: "bg-primary text-primary-foreground ring-primary",
  complete: "bg-secondary text-secondary-foreground ring-secondary",
};

const LABEL_STATUS_CLASSES: Record<WizardStepStatus, string> = {
  pending: "text-foreground-muted",
  active: "text-foreground font-semibold",
  complete: "text-foreground",
};

export function WizardStepper({
  steps,
  currentStep,
  onStepChange,
  children,
  className,
}: WizardStepperProps) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === currentStep),
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLOListElement>) => {
      if (!onStepChange || steps.length === 0) return;
      const lastIndex = steps.length - 1;
      let targetIndex: number;
      switch (event.key) {
        case "ArrowRight":
          targetIndex = Math.min(activeIndex + 1, lastIndex);
          break;
        case "ArrowLeft":
          targetIndex = Math.max(activeIndex - 1, 0);
          break;
        case "Home":
          targetIndex = 0;
          break;
        case "End":
          targetIndex = lastIndex;
          break;
        default:
          return;
      }
      event.preventDefault();
      const target = steps[targetIndex];
      if (target && target.id !== currentStep) onStepChange(target.id);
    },
    [onStepChange, steps, activeIndex, currentStep],
  );

  return (
    <div
      data-slot="wizard-stepper"
      data-current={currentStep}
      className={cn("flex w-full flex-col gap-8", className)}
    >
      <ol
        aria-label="Wizard steps"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex w-full items-center gap-2 outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring rounded-full",
        )}
      >
        {steps.map((step, index) => {
          const status = computeStatus(index, activeIndex);
          const isLast = index === steps.length - 1;
          // Connector color mirrors the "left" side's state: if the step
          // just before the connector is complete, tint teal; otherwise
          // use the muted border color.
          const connectorComplete = status === "complete";
          return (
            <li
              key={step.id}
              className={cn("flex shrink-0 items-center gap-2", !isLast && "flex-1")}
            >
              <button
                type="button"
                data-slot="wizard-step"
                data-status={status}
                data-step-id={step.id}
                aria-current={status === "active" ? "step" : undefined}
                onClick={() => {
                  if (onStepChange && step.id !== currentStep) {
                    onStepChange(step.id);
                  }
                }}
                className={cn(
                  "group inline-flex items-center gap-2 rounded-full px-2 py-1.5 sm:gap-3 sm:px-3",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "transition-colors",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
                    "text-sm font-medium ring-1 transition-colors",
                    PILL_STATUS_CLASSES[status],
                  )}
                >
                  {step.icon ?? index + 1}
                </span>
                {/* Hide non-active labels on phones so the row never overflows;
                    the active step keeps its label for context. All show at sm+. */}
                <span
                  className={cn(
                    "text-sm transition-colors",
                    LABEL_STATUS_CLASSES[status],
                    status !== "active" && "hidden sm:inline",
                  )}
                >
                  {step.label}
                </span>
              </button>
              {!isLast && (
                <span
                  aria-hidden="true"
                  data-slot="wizard-connector"
                  data-complete={connectorComplete ? "true" : undefined}
                  className={cn(
                    "h-px flex-1 transition-colors",
                    connectorComplete ? "bg-secondary" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {children !== undefined && <div data-slot="wizard-content">{children}</div>}
    </div>
  );
}
