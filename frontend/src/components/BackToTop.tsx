/**
 * BackToTop — global "scroll to top" affordance mounted once in App.tsx.
 *
 * Document-scroll based (the app has no inner scroll container — `<main>` flows
 * in the window). Reveals itself past one viewport of scroll; short routes never
 * scroll that far, so it stays hidden with no per-page wiring. Always mounted
 * with an opacity/translate transition so it fades BOTH ways (conditional
 * unmount would only animate the entrance).
 */
import { useEffect, useState } from "react";
import { ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Recompute on resize too: `visible` compares scrollY against innerHeight,
    // which changes on resize/rotation with no scroll event to re-sync it.
    const sync = () => setVisible(window.scrollY > window.innerHeight);
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    sync(); // initial state (e.g. restored scroll position)
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const scrollToTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <Button
      variant="secondary"
      size="icon"
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      data-slot="back-to-top"
      onClick={scrollToTop}
      className={cn(
        "fixed bottom-6 right-6 z-40 rounded-full shadow-lg transition-all duration-300 motion-reduce:transition-none",
        visible ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowUpIcon className="size-5" />
    </Button>
  );
}
