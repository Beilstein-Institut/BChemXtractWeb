"use client";

import * as React from "react";
import { FlaskConicalIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * StardustButton — deep-navy pearl CTA.
 *
 * A self-contained specialty button used for the Extract structures CTA
 * in the upload drop-zone. Unlike the generic claymorphism Button, the
 * StardustButton uses a nested-pseudo-element pearl shell, a sparkle
 * glyph that swaps on hover, and an icon that tilts + scales. All of
 * this is layered on top of a deep-navy body so the CTA reads as the
 * primary action without competing visually with crimson claymorphism
 * buttons elsewhere on the page.
 *
 * The styling lives in a scoped `<style>` tag rendered alongside the
 * button. This keeps the component drop-in usable without extending
 * the global CSS layer (the effect is used in exactly one place). The
 * CSS respects `prefers-reduced-motion` by flattening every transition
 * and disabling the hover transforms.
 *
 * Default icon is `FlaskConicalIcon` (chemistry-adjacent). Override
 * via the `icon` prop if the CTA repurposes this button elsewhere.
 */
export interface StardustButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visible button text. Falls back to "Extract structures". */
  label?: string;
  /** Optional icon override — defaults to FlaskConicalIcon. */
  icon?: React.ReactNode;
}

export const StardustButton = React.forwardRef<HTMLButtonElement, StardustButtonProps>(
  function StardustButton(
    { label = "Extract structures", icon, className, children, ...props },
    ref,
  ) {
    const content = children ?? label;
    const iconNode = icon ?? <FlaskConicalIcon className="size-5" aria-hidden="true" />;

    return (
      <>
        <style>{stardustCss}</style>
        <button
          ref={ref}
          type="button"
          className={cn("stardust-button", className)}
          data-slot="stardust-button"
          {...props}
        >
          <span className="stardust-button__wrap">
            <span className="stardust-button__label">
              <span
                className="stardust-button__sparkle stardust-button__sparkle--rest"
                aria-hidden="true"
              >
                ✧
              </span>
              <span
                className="stardust-button__sparkle stardust-button__sparkle--hover"
                aria-hidden="true"
              >
                ✦
              </span>
              <span className="stardust-button__icon" aria-hidden="true">
                {iconNode}
              </span>
              <span className="stardust-button__text">{content}</span>
            </span>
          </span>
        </button>
      </>
    );
  },
);

StardustButton.displayName = "StardustButton";

/**
 * Scoped CSS for the StardustButton. Declared outside the component so
 * React de-duplicates the style element in the DOM even when multiple
 * buttons render. The pearl shell uses nested pseudo-elements on the
 * `__wrap` span (not the button itself) so the shimmer and gloss can
 * be masked with overflow:hidden without clipping the outer shadows.
 */
const stardustCss = `
.stardust-button {
  /* Light-mode (default) — sky-600 ocean pearl.
   * Chosen distinct from --primary Apple Blue so the CTA still reads as
   * a specialty button, not the generic primary. White text on sky-600
   * passes WCAG AA (~5.0:1).
   */
  --pearl-bg: #0284c7;
  --pearl-text: #ffffff;
  --pearl-accent: #e0f2fe;
  --pearl-rest-highlight: rgba(255, 255, 255, 0.55);
  --pearl-rest-edge: rgba(8, 47, 73, 0.45);
  --pearl-rest-underglow: rgba(186, 230, 253, 0.55);
  --pearl-rest-drop-far: rgba(15, 23, 42, 0.18);
  --pearl-rest-drop-near: rgba(15, 23, 42, 0.30);
  --pearl-hover-highlight: rgba(255, 255, 255, 0.70);
  --pearl-hover-edge: rgba(8, 47, 73, 0.50);
  --pearl-hover-underglow: rgba(186, 230, 253, 0.75);
  --pearl-hover-drop-far: rgba(15, 23, 42, 0.22);
  --pearl-hover-drop-near: rgba(15, 23, 42, 0.38);
  --pearl-active-highlight: rgba(255, 255, 255, 0.65);
  --pearl-active-edge: rgba(8, 47, 73, 0.60);
  --pearl-active-underglow: rgba(186, 230, 253, 0.45);
  --pearl-active-drop-far: rgba(15, 23, 42, 0.20);
  --pearl-active-drop-near: rgba(15, 23, 42, 0.40);
  --pearl-bubble-bg: rgba(255, 255, 255, 0.35);
  --pearl-gloss-start: rgba(255, 255, 255, 0.45);
  --pearl-gloss-sheen: rgba(255, 255, 255, 0.60);

  outline: none;
  cursor: pointer;
  border: 0;
  position: relative;
  border-radius: 100px;
  background-color: var(--pearl-bg);
  color: var(--pearl-text);
  font-size: 1rem;
  font-weight: 500;
  padding: 0;
  transition:
    box-shadow 0.3s ease,
    transform 0.15s ease;
  box-shadow:
    inset 0 0.3rem 0.9rem var(--pearl-rest-highlight),
    inset 0 -0.1rem 0.3rem var(--pearl-rest-edge),
    inset 0 -0.4rem 0.9rem var(--pearl-rest-underglow),
    0 3rem 3rem var(--pearl-rest-drop-far),
    0 1rem 1rem -0.6rem var(--pearl-rest-drop-near);
}

/* Dark-mode — original deep-navy pearl. */
.dark .stardust-button {
  --pearl-bg: #0a1929;
  --pearl-text: rgba(193, 228, 255, 0.95);
  --pearl-accent: rgba(129, 216, 255, 0.9);
  --pearl-rest-highlight: rgba(255, 255, 255, 0.30);
  --pearl-rest-edge: rgba(0, 0, 0, 0.70);
  --pearl-rest-underglow: rgba(129, 216, 255, 0.50);
  --pearl-rest-drop-far: rgba(0, 0, 0, 0.25);
  --pearl-rest-drop-near: rgba(0, 0, 0, 0.70);
  --pearl-hover-highlight: rgba(129, 216, 255, 0.40);
  --pearl-hover-edge: rgba(0, 0, 0, 0.70);
  --pearl-hover-underglow: rgba(64, 180, 255, 0.60);
  --pearl-hover-drop-far: rgba(0, 0, 0, 0.30);
  --pearl-hover-drop-near: rgba(0, 0, 0, 0.80);
  --pearl-active-highlight: rgba(129, 216, 255, 0.50);
  --pearl-active-edge: rgba(0, 0, 0, 0.80);
  --pearl-active-underglow: rgba(64, 180, 255, 0.40);
  --pearl-active-drop-far: rgba(0, 0, 0, 0.30);
  --pearl-active-drop-near: rgba(0, 0, 0, 0.80);
  --pearl-bubble-bg: rgba(64, 180, 255, 0.15);
  --pearl-gloss-start: rgba(64, 180, 255, 0.25);
  --pearl-gloss-sheen: rgba(129, 216, 255, 0.60);
}

.stardust-button__wrap {
  display: inline-block;
  padding: 0.95rem 2rem;
  border-radius: inherit;
  position: relative;
  overflow: hidden;
}

.stardust-button__wrap::before,
.stardust-button__wrap::after {
  content: "";
  position: absolute;
  transition: all 0.35s ease;
  pointer-events: none;
}

.stardust-button__wrap::before {
  left: -15%;
  right: -15%;
  bottom: 25%;
  top: -100%;
  border-radius: 50%;
  background-color: var(--pearl-bubble-bg);
}

.stardust-button__wrap::after {
  left: 6%;
  right: 6%;
  top: 12%;
  bottom: 40%;
  border-radius: 22px 22px 0 0;
  box-shadow: inset 0 10px 8px -10px var(--pearl-gloss-sheen);
  background: linear-gradient(
    180deg,
    var(--pearl-gloss-start) 0%,
    rgba(0, 0, 0, 0) 50%,
    rgba(0, 0, 0, 0) 100%
  );
}

.stardust-button__label {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0;
  transition: transform 0.25s ease;
  transform: translateY(2%);
  position: relative;
  z-index: 1;
}

.stardust-button__sparkle {
  display: inline-flex;
  align-items: center;
  transition: opacity 0.15s ease;
  font-size: 1.1rem;
  color: var(--pearl-accent);
}
.stardust-button__sparkle--hover {
  display: none;
}

.stardust-button__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--pearl-accent);
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.stardust-button__text {
  display: inline-block;
  letter-spacing: 0.01em;
}

.stardust-button:hover:not(:disabled) {
  box-shadow:
    inset 0 0.3rem 0.5rem var(--pearl-hover-highlight),
    inset 0 -0.1rem 0.3rem var(--pearl-hover-edge),
    inset 0 -0.4rem 0.9rem var(--pearl-hover-underglow),
    0 3rem 3rem var(--pearl-hover-drop-far),
    0 1rem 1rem -0.6rem var(--pearl-hover-drop-near);
}
.stardust-button:hover:not(:disabled) .stardust-button__wrap::before {
  transform: translateY(-5%);
}
.stardust-button:hover:not(:disabled) .stardust-button__wrap::after {
  opacity: 0.45;
  transform: translateY(5%);
}
.stardust-button:hover:not(:disabled) .stardust-button__label {
  transform: translateY(-4%);
}
.stardust-button:hover:not(:disabled) .stardust-button__icon {
  transform: rotate(-12deg) scale(1.1);
}
.stardust-button:hover:not(:disabled) .stardust-button__sparkle--rest {
  display: none;
}
.stardust-button:hover:not(:disabled) .stardust-button__sparkle--hover {
  display: inline-flex;
}

.stardust-button:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow:
    inset 0 0.3rem 0.5rem var(--pearl-active-highlight),
    inset 0 -0.1rem 0.3rem var(--pearl-active-edge),
    inset 0 -0.4rem 0.9rem var(--pearl-active-underglow),
    0 1.5rem 1.5rem var(--pearl-active-drop-far),
    0 0.5rem 0.5rem -0.3rem var(--pearl-active-drop-near);
}

.stardust-button:focus-visible {
  outline: 2px solid var(--pearl-accent);
  outline-offset: 3px;
}

.stardust-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .stardust-button,
  .stardust-button__label,
  .stardust-button__icon,
  .stardust-button__wrap::before,
  .stardust-button__wrap::after {
    transition: none !important;
  }
  .stardust-button:hover:not(:disabled) .stardust-button__icon,
  .stardust-button:hover:not(:disabled) .stardust-button__label {
    transform: none;
  }
  .stardust-button:active:not(:disabled) {
    transform: none;
  }
}
`;
