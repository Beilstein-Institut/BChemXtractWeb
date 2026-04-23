/**
 * ExperimentalBanner — dismissible amber disclaimer at the top of the
 * Reactions tab (Plan 10 D-09 / UI-SPEC §2).
 *
 * Session-scoped dismissal (Pitfall 7): uses sessionStorage exclusively.
 * Closing the tab / browser / refreshing resets the dismissal; the banner
 * reappears on next session.
 *
 * Accessibility: container has role="note" (not role="alert" — this is a
 * static disclaimer, not a live error announcement). Dismiss button has an
 * explicit aria-label. The banner does not trap focus.
 */
import { useState, useEffect } from "react";
import { AlertTriangleIcon, XIcon } from "lucide-react";
import { BrandName } from "@/components/BrandName";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "bcx.reactions.experimentalBannerDismissed";

export function ExperimentalBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Defensive: if sessionStorage changes (e.g., another tab), sync.
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.storageArea === window.sessionStorage && e.key === STORAGE_KEY) {
        setDismissed(e.newValue === "1");
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  if (dismissed) return null;

  function handleDismiss() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // sessionStorage unavailable (private mode) — dismiss in-memory anyway.
    }
    setDismissed(true);
  }

  return (
    <div
      role="note"
      className={cn(
        "rounded-xl border border-amber-200 border-l-4 border-l-amber-500",
        "bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 dark:border-l-amber-500",
        "py-3 px-4 flex items-start gap-3",
      )}
    >
      <AlertTriangleIcon
        className="size-4 shrink-0 text-amber-700 dark:text-amber-500 mt-0.5"
        aria-hidden="true"
      />
      <p className="flex-1 text-caption leading-[1.29] tracking-[-0.016em] text-amber-900 dark:text-amber-200">
        <span className="font-semibold">Experimental.</span> Reaction extraction from ChemDraw files
        is a best-effort feature of <BrandName />. Results may be incomplete or inaccurate — verify
        before use.
      </p>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss experimental disclaimer"
        onClick={handleDismiss}
        className={cn("shrink-0 -mr-1 -mt-1", "hover:bg-amber-100 dark:hover:bg-amber-900/40")}
      >
        <XIcon className="size-3.5 text-amber-700 dark:text-amber-500" />
      </Button>
    </div>
  );
}
