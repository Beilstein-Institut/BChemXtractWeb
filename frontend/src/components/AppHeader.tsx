import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { BrandName } from "@/components/BrandName";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/SearchInput";
import { NavLinks } from "@/components/nav/NavLinks";
import { isRouteActive } from "@/components/nav/navActive";
import { ChemistryThemeSwitch } from "@/components/ChemistryThemeSwitch";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useRoute } from "@/lib/router";
import { Link } from "@/lib/Link";

const MOBILE_LINKS = [
  { label: "Extract", to: "/" },
  { label: "Browse", to: "/browse" },
  { label: "History", to: "/history" },
  { label: "Settings", to: "/settings" },
  { label: "About", to: "/about" },
] as const;

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
        "text-lg text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full",
      )}
    >
      <img src="/bchemxtract-logo.svg" alt="" aria-hidden="true" className="h-8 w-8 shrink-0" />
      <BrandName />
    </Link>
  );
}

/**
 * AppHeader — Phase 3 Liquid Glass chrome top bar.
 *
 * Renders the sticky glass-tinted top bar with token-driven
 * backdrop-filter, wordmark logo, the 4-route NavLinks, global
 * SearchInput, ChemistryThemeSwitch, and a mobile hamburger that opens the
 * Base UI Sheet (Task 6 glass-tinted drawer).
 */
export function AppHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const route = useRoute();

  return (
    <header
      data-slot="app-header"
      className={cn(
        "sticky top-0 z-40 w-full",
        "bg-[var(--glass-tint-light)] dark:bg-[var(--glass-tint-dark)]",
        "backdrop-blur-[var(--glass-blur)] backdrop-saturate-[var(--glass-saturate)]",
        "border-b border-[var(--glass-border)]",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        <Logo />

        {/*
          Center nav pill — secretlevel.co-style centered container
          around NavLinks. Uses a plain div so NavLinks keeps its
          own <nav aria-label="Main navigation"> semantic root
          without nesting <nav> inside <nav>.
        */}
        <div
          data-slot="nav-pill"
          className={cn(
            "hidden lg:flex items-center",
            "rounded-full border border-border bg-surface-muted/75",
            "px-2 py-1.5 backdrop-blur-sm",
          )}
        >
          <NavLinks className="flex" />
        </div>

        {/*
          Right-cluster — search + theme toggle + (mobile) hamburger.
          Sits in its own group mirroring the secretlevel.co right-pill
          CTA slot, though we keep it as a tight flex row rather than a
          wrapping pill so the chem flask toggle can breathe.
        */}
        <div data-slot="header-right-cluster" className="flex items-center gap-3">
          <SearchInput />
          <ChemistryThemeSwitch />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation menu"
                />
              }
            >
              <MenuIcon className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[320px]">
              <SheetHeader className="mb-6">
                <SheetTitle className="text-lg">
                  <BrandName />
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile navigation" className="flex flex-col">
                {MOBILE_LINKS.map((link) => {
                  const active = isRouteActive(route, link.to);
                  return (
                    <SheetClose
                      key={link.label}
                      nativeButton={false}
                      render={
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
                      }
                    />
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
