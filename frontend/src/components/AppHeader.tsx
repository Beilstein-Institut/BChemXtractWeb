import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { BrandName } from "@/components/BrandName";
import { Button } from "@/components/ui/button";
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
import { asset } from "@/lib/basePath";
import { Link } from "@/lib/Link";

const MOBILE_LINKS = [
  { label: "Home", to: "/" },
  { label: "Extract", to: "/extract" },
  { label: "View", to: "/view" },
  { label: "Browse", to: "/browse" },
  { label: "History", to: "/history" },
  { label: "Settings", to: "/settings" },
  { label: "About", to: "/about" },
] as const;

/** Logo — the BChemXtract mark alone, linking home. */
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
      {/* Mark only, no wordmark; the link's aria-label names it. */}
      <img
        src={asset("bchemxtract-logo.svg")}
        alt=""
        aria-hidden="true"
        className="logo-glow h-8 w-8 shrink-0"
      />
    </Link>
  );
}

/**
 * AppHeader — Liquid Glass chrome top bar.
 *
 * Renders the sticky glass-tinted top bar with token-driven
 * backdrop-filter, logo mark, the route NavLinks, ChemistryThemeSwitch, the
 * Beilstein-Institut mark, and a mobile hamburger that opens the Base UI
 * Sheet (glass-tinted drawer).
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
      <div className="mx-auto flex h-[var(--header-height)] max-w-7xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
        {/*
          Left group — logo mark with the nav pill right beside it, so the
          product and its pages read as one unit. The nav pill is a plain div
          so NavLinks keeps its own <nav aria-label="Main navigation">
          semantic root without nesting <nav> inside <nav>.
        */}
        <div className="flex min-w-0 items-center gap-4 xl:gap-6">
          <Logo />
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
        </div>

        {/*
          Right-cluster — theme toggle + publisher mark + (mobile) hamburger.
          Search is not here: it lives on the Browse and History pages, where
          there is extracted data to search.
          Sits in its own group mirroring the secretlevel.co right-pill
          CTA slot, though we keep it as a tight flex row rather than a
          wrapping pill so the chem flask toggle can breathe.
        */}
        <div data-slot="header-right-cluster" className="flex min-w-0 items-center gap-1 sm:gap-3">
          <ChemistryThemeSwitch />
          {/* Publisher mark at the far right, split from the controls by a
              hairline: the left edge stays the product (mark = Home), the
              right edge says who makes it, and the two links never sit side by
              side. Hidden on phones, where the controls need the width; the
              footer still names the institute there. Dark mode: a shape-
              following glow (index.css .publisher-glow) keeps the navy mark
              readable without recolouring it; a filter takes no space, so the
              header never shifts between themes. */}
          <span aria-hidden="true" className="hidden h-8 w-px bg-border sm:block" />
          <a
            href="https://www.beilstein-institut.de/en/"
            target="_blank"
            rel="noopener noreferrer"
            data-slot="header-publisher"
            className="publisher-glow hidden shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:block"
          >
            <img
              src={asset("Logo_Beilstein_schmal_RGB.svg")}
              alt="Beilstein-Institut"
              width={876}
              height={202}
              className="h-10 w-auto"
            />
          </a>
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
                            // px-4 aligns the label's left edge with the
                            // SheetHeader logo (also p-4) so the text isn't
                            // flush against the drawer edge.
                            "px-4 py-3 text-base font-medium border-b transition-colors",
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
