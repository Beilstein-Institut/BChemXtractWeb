/**
 * Shared Suspense fallback for route-level lazy boundaries.
 *
 * Matches the outer padding of <main> in App.tsx so that swapping
 * this placeholder for the real page content doesn't shift layout.
 * The spinner is announced via role="status" for assistive tech.
 */

import { Loader2Icon } from "lucide-react";

export function PageSuspenseFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      data-slot="page-suspense-fallback"
      className="flex min-h-[40vh] items-center justify-center"
    >
      <Loader2Icon
        aria-hidden="true"
        className="h-8 w-8 animate-spin text-foreground-muted motion-reduce:animate-none"
      />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
