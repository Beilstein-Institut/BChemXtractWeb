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
import { useRoute } from "@/lib/router";
import { Link } from "@/lib/Link";

const NAV_LINKS = [
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
 * AppHeader — Apple-inspired sticky navigation bar.
 *
 * Routes via the lightweight pathname router (src/lib/router.tsx). Active
 * route gets an accent-tinted pill treatment.
 */
export function AppHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const route = useRoute();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full",
        "nav-glass-light dark:nav-glass",
        "border-b border-black/5 dark:border-white/5",
      )}
    >
      <div className="mx-auto flex h-12 max-w-[980px] items-center justify-between px-6">
        <Link
          to="/"
          className="text-[17px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white"
          aria-label="BChemXtractWeb home"
        >
          <TextScramble text="BChemXtractWeb" duration={1.0} />
        </Link>

        <nav className="hidden lg:flex items-center gap-1" aria-label="Main navigation">
          {NAV_LINKS.map((link) => {
            const active = isActive(route, link.to);
            return (
              <Link
                key={link.label}
                to={link.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "px-3 py-1.5 text-[12px] font-normal rounded-full transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]",
                  active
                    ? "bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]"
                    : "text-black/80 dark:text-white/80 hover:text-[#0071e3] dark:hover:text-[#2997ff]",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <SearchInput className="mx-4" />

        <div className="flex items-center gap-2">
          <ModeToggle />

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
                <SheetTitle className="text-[17px] font-semibold">BChemXtractWeb</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile navigation" className="flex flex-col">
                {NAV_LINKS.map((link) => {
                  const active = isActive(route, link.to);
                  return (
                    <SheetClose key={link.label} asChild>
                      <Link
                        to={link.to}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "py-3 text-[17px] font-normal border-b transition-colors",
                          active
                            ? "text-[#0071e3] dark:text-[#2997ff] border-[#0071e3]/30"
                            : "text-[#1d1d1f] dark:text-white border-black/5 dark:border-white/5 hover:text-[#0071e3] dark:hover:text-[#2997ff]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]",
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
