/**
 * NavLinks — primary nav for AppHeader (Phase 3 Liquid Glass, Task 7).
 *
 * Four routes: Extract, Browse, History, About. The active route gets
 * an accent-tinted pill treatment driven by the `data-active` attribute
 * so CSS consumers (and Playwright assertions) can target it without
 * reaching for the string in className.
 */
import { Link } from "@/lib/Link";
import { useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";

import { isRouteActive } from "./navActive";

const LINKS = [
  { to: "/", label: "Extract" },
  { to: "/browse", label: "Browse" },
  { to: "/history", label: "History" },
  { to: "/about", label: "About" },
] as const;

export function NavLinks({ className }: { className?: string }) {
  const route = useRoute();

  return (
    <nav
      aria-label="Main navigation"
      data-slot="nav-links"
      className={cn("items-center gap-1", className)}
    >
      {LINKS.map((link) => {
        const active = isRouteActive(route, link.to);
        return (
          <Link
            key={link.label}
            to={link.to}
            aria-current={active ? "page" : undefined}
            data-slot="nav-link"
            data-active={active ? "true" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent text-primary font-semibold"
                : "text-foreground-muted hover:bg-accent hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
