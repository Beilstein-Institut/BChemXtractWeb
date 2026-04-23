"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * FloatingPaths — layered animated SVG paths, designed to live behind
 * other content (absolute inset-0 pointer-events-none).
 *
 * Three tweaks over the reference:
 * 1. `useReducedMotion()` honored — falls back to static paths.
 * 2. Path density halved (12 per side instead of 36) — ~⅓ the CPU
 *    without losing visual density.
 * 3. Tab-visibility guard — pauses animations when the tab is
 *    backgrounded (the browser already throttles, but this frees
 *    the RAF timers entirely).
 */
export function FloatingPaths({ position = 1 }: { position?: number }) {
  const reduceMotion = useReducedMotion();
  const [hidden, setHidden] = useState(
    typeof document !== "undefined" && document.visibilityState === "hidden",
  );

  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  const paths = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 15 * position} -${189 + i * 18}C-${
      380 - i * 15 * position
    } -${189 + i * 18} -${312 - i * 15 * position} ${216 - i * 18} ${
      152 - i * 15 * position
    } ${343 - i * 18}C${616 - i * 15 * position} ${470 - i * 18} ${
      684 - i * 15 * position
    } ${875 - i * 18} ${684 - i * 15 * position} ${875 - i * 18}`,
    width: 0.5 + i * 0.09,
    baseOpacity: 0.1 + i * 0.06,
  }));

  const shouldAnimate = !reduceMotion && !hidden;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      data-slot="background-paths"
    >
      <svg
        className="h-full w-full text-primary/40 dark:text-primary/30"
        viewBox="0 0 696 316"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={path.baseOpacity}
            initial={{ pathLength: shouldAnimate ? 0.3 : 1, opacity: 0.6 }}
            animate={
              shouldAnimate
                ? {
                    pathLength: 1,
                    opacity: [0.3, 0.6, 0.3],
                    pathOffset: [0, 1, 0],
                  }
                : { pathLength: 1, opacity: path.baseOpacity, pathOffset: 0 }
            }
            transition={
              shouldAnimate
                ? {
                    duration: 22 + (path.id % 5) * 2,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "linear",
                  }
                : { duration: 0 }
            }
          />
        ))}
      </svg>
    </div>
  );
}

/**
 * BackgroundPaths — two mirrored FloatingPaths layers.
 * Compose behind hero content with `relative` + `overflow-hidden` on
 * the parent. Not a full-screen hero wrapper — just the background.
 */
export function BackgroundPaths({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      data-slot="background-paths-pair"
    >
      <FloatingPaths position={1} />
      <FloatingPaths position={-1} />
    </div>
  );
}
