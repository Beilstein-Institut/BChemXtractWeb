import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { SearchInput } from "@/components/SearchInput";
import { TextScramble } from "@/components/ui/text-scramble";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/nav-sheet";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Extract", href: "#extract" },
  { label: "Browse", href: "#browse" },
  { label: "History", href: "#history" },
] as const;

/**
 * AppHeader — Apple-inspired sticky navigation bar.
 *
 * - Sticky at top-0 z-50, 48px height
 * - Light mode: translucent light glass (nav-glass-light)
 * - Dark mode: translucent dark glass (dark:nav-glass)
 * - Brand "BChemXtractWeb" with TextScramble animation on mount (1.0s)
 * - Desktop: inline nav links (md:flex, hidden on mobile)
 * - Mobile: hamburger button opens a Sheet with nav links
 * - ModeToggle always visible on the right
 */
export function AppHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full",
        "nav-glass-light dark:nav-glass",
        "border-b border-black/5 dark:border-white/5",
      )}
    >
      <div className="mx-auto flex h-12 max-w-[980px] items-center justify-between px-6">
        {/* Brand */}
        <a
          href="/"
          className="text-[17px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white"
          aria-label="BChemXtractWeb home"
        >
          <TextScramble text="BChemXtractWeb" duration={1.0} />
        </a>

        {/* Desktop nav links — drop at <lg so the SearchInput has room (UI-SPEC §1) */}
        <nav className="hidden lg:flex items-center gap-1" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={cn(
                "px-3 py-3 text-[12px] font-normal",
                "text-black/80 dark:text-white/80",
                "hover:underline underline-offset-4 transition-colors",
                "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]",
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Global search — inlined for md+, Sheet side="top" for <md (D-02) */}
        <SearchInput className="mx-4" />

        {/* Right side: theme toggle + mobile hamburger */}
        <div className="flex items-center gap-2">
          <ModeToggle />

          {/* Mobile hamburger (md:hidden) */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation menu"
              >
                <MenuIcon className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[320px]">
              <SheetHeader className="mb-6">
                <SheetTitle className="text-[17px] font-semibold">BChemXtractWeb</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile navigation" className="flex flex-col">
                {NAV_LINKS.map((link) => (
                  <SheetClose key={link.label} asChild>
                    <a
                      href={link.href}
                      className={cn(
                        "py-3 text-[17px] font-normal",
                        "text-[#1d1d1f] dark:text-white",
                        "border-b border-black/5 dark:border-white/5",
                        "hover:text-[#0071e3] transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]",
                      )}
                    >
                      {link.label}
                    </a>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
