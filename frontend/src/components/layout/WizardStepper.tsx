import type { KeyboardEvent, ReactNode } from "react";
import { useCallback } from "react";

import { cn } from "@/lib/utils";

/**
 * WizardStepper — Phase 3 Liquid Glass rebuild (Task 8).
 *
 * Top-of-page step indicator: a horizontal sequence of numbered pills
 * joined by thin connector lines, followed by a content slot below.
 * Task 10 will compose the Extract page wizard on top of this.
 *
 * Visual contract (derived from the phase plan):
 *   - pending  → `bg-surface-muted text-foreground-muted` pill
 *   - active   → `bg-primary text-primary-foreground` pill (crimson)
 *   - complete → `bg-secondary text-secondary-foreground` pill (teal)
 *   - connector between completed / active steps inherits the higher of
 *     the two adjacent states (teal if both complete, teal->crimson
 *     gradient not attempted — plan is terse; we use teal when the left
 *     side is complete, muted otherwise).
 *
 * Keyboard navigation (per plan): focusing the stepper root and pressing
 *   - ArrowRight → advance to the next step (consumer decides via
 *     `onStepChange` whether to gate past not-yet-unlocked steps).
 *   - ArrowLeft  → move to the previous step.
 *   - Home / End → jump to first / last (UX nicety; not required by
 *     the plan but inexpensive and discoverable).
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

function computeStatus(
  index: number,
  activeIndex: number,
): WizardStepStatus {
  if (index < activeIndex) return "complete";
  if (index === activeIndex) return "active";
  return "pending";
}

const PILL_STATUS_CLASSES: Record<WizardStepStatus, string> = {
  pending:
    "bg-surface-muted text-foreground-muted ring-border",
  active:
    "bg-primary text-primary-foreground ring-primary",
  complete:
    "bg-secondary text-secondary-foreground ring-secondary",
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
      switch (event.key) {
        case "ArrowRight": {
          event.preventDefault();
          const next = steps[Math.min(activeIndex + 1, steps.length - 1)];
          if (next && next.id !== currentStep) onStepChange(next.id);
          break;
        }
        case "ArrowLeft": {
          event.preventDefault();
          const prev = steps[Math.max(activeIndex - 1, 0)];
          if (prev && prev.id !== currentStep) onStepChange(prev.id);
          break;
        }
        case "Home": {
          event.preventDefault();
          const first = steps[0];
          if (first && first.id !== currentStep) onStepChange(first.id);
          break;
        }
        case "End": {
          event.preventDefault();
          const last = steps[steps.length - 1];
          if (last && last.id !== currentStep) onStepChange(last.id);
          break;
        }
        default:
          break;
      }
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
              className={cn(
                "flex shrink-0 items-center gap-2",
                !isLast && "flex-1",
              )}
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
                  "group inline-flex items-center gap-3 rounded-full px-3 py-1.5",
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
                <span
                  className={cn(
                    "text-sm transition-colors",
                    LABEL_STATUS_CLASSES[status],
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

      {children !== undefined && (
        <div data-slot="wizard-content">{children}</div>
      )}
    </div>
  );
}
