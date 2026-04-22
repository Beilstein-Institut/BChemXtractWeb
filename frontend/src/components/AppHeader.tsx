import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/SearchInput";
import { NavLinks } from "@/components/nav/NavLinks";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/nav-sheet";
import { cn } from "@/lib/utils";
import { useRoute } from "@/lib/router";
import { Link } from "@/lib/Link";

const MOBILE_LINKS = [
  { label: "Extract", to: "/" },
  { label: "Browse", to: "/browse" },
  { label: "History", to: "/history" },
  { label: "About", to: "/about" },
] as const;

function isActive(route: string, to: string): boolean {
  if (to === "/") return route === "/";
  return route === to || route.startsWith(`${to}/`);
}

/**
 * Logo — inline wordmark for the Liquid Glass AppHeader (Task 7).
 *
 * Uses the Fraunces display family via `font-display` (Satoshi was not
 * available on npm; Fraunces is the project-wide fallback). A small
 * crimson accent dot sits to the right of the wordmark for visual
 * weight without overpowering the glass chrome.
 */
function Logo() {
  return (
    <Link
      to="/"
      aria-label="BChemXtract home"
      data-slot="app-logo"
      className={cn(
        "group inline-flex items-center gap-2",
        "font-display text-lg tracking-tight text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full",
      )}
    >
      <span className="font-semibold">BChemXtract</span>
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-primary"
      />
    </Link>
  );
}

/**
 * AppHeader — Phase 3 Liquid Glass chrome top bar.
 *
 * Renders the sticky glass-tinted top bar with token-driven
 * backdrop-filter, wordmark logo, the 4-route NavLinks, global
 * SearchInput, ThemeSwitch, and a mobile hamburger that opens the
 * nav-sheet.
 */
export function AppHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const route = useRoute();

  return (
    <header
      data-slot="app-header"
      className={cn(
        "sticky top-0 z-50 w-full",
        "bg-[var(--glass-tint-light)] dark:bg-[var(--glass-tint-dark)]",
        "backdrop-blur-[var(--glass-blur)] backdrop-saturate-[var(--glass-saturate)]",
        "border-b border-[var(--glass-border)]",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        <Logo />

        <NavLinks className="hidden lg:flex" />

        <SearchInput className="mx-4" />

        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation menu"
              >
                <MenuIcon className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[320px]">
              <SheetHeader className="mb-6">
                <SheetTitle className="font-display text-lg font-semibold">
                  BChemXtract
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile navigation" className="flex flex-col">
                {MOBILE_LINKS.map((link) => {
                  const active = isActive(route, link.to);
                  return (
                    <SheetClose key={link.label} asChild>
                      <Link
                        to={link.to}
                        aria-current={active ? "page" : undefined}
                        data-slot="nav-link"
                        data-active={active ? "true" : undefined}
                        className={cn(
                          "py-3 text-base font-medium border-b transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "text-primary border-primary/30 font-semibold"
                            : "text-foreground border-border hover:text-primary",
                        )}
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
