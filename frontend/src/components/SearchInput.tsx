/**
 * SearchInput — inline global search box for AppHeader (D-01, D-02, D-03, D-18).
 *
 * Features:
 *  - `/` keyboard shortcut focuses (outside other text inputs) — D-18
 *  - `Esc` clears + blurs
 *  - Type-detection badge appears once input ≥ 2 chars; click opens
 *    override Popover with radio items (D-01)
 *  - Mobile (< md): icon-only trigger; tap opens Sheet side="top" with the
 *    full input
 *  - Publishes its underlying <input> element to `@/lib/searchFocus`
 *    (searchInputRef.current) on mount so Plan 07's BrowseToolbar
 *    "Search within" can focus it without DOM-querying by aria-label.
 *  - SVG rendering of results lives in Plan 07's SearchResults — this file
 *    only drives the useSearch hook
 */
import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { useSearch } from "@/hooks/useSearch";
import { searchInputRef } from "@/lib/searchFocus";
import type { SearchType } from "@/types/search";
import { cn } from "@/lib/utils";

// Accepts full <14>-<10>-<1> as well as PubChem-style partial prefixes:
// just <14> (any stereo/isotope/protonation) or <14>-<10> (any protonation).
const INCHI_KEY_RE = /^[A-Z]{14}(?:-[A-Z]{10}(?:-[A-Z])?)?$/;
const FORMULA_RE = /^([A-Z][a-z]?\d*)+$/;

const TYPE_LABEL: Record<Exclude<SearchType, "auto">, string> = {
  inchi_key: "InChI key",
  formula: "Formula",
  smiles: "SMILES",
  substructure: "Substructure",
};

/** Front-end pre-classification hint — authoritative detection is server-side. */
function detectHint(raw: string): Exclude<SearchType, "auto"> {
  const s = raw.trim();
  if (INCHI_KEY_RE.test(s.toUpperCase())) return "inchi_key";
  if (FORMULA_RE.test(s)) return "formula";
  return "smiles";
}

interface RenderInputArgs {
  /** Pass `true` for the header-inlined input so the shared searchInputRef
   *  is published on mount. The mobile Sheet copy passes `false` — it does
   *  NOT need ref sharing since Plan 07's "Search within" always focuses
   *  the header (not a sheet instance). */
  isHeader: boolean;
}

/**
 * Trailing affordance inside the search input — one of:
 *   loading spinner, clear-button, keyboard hint, or nothing.
 */
function renderTrailingAffordance(args: {
  isPending: boolean;
  hasContent: boolean;
  isHeader: boolean;
  showKbdHint: boolean;
  clear: () => void;
}) {
  const { isPending, hasContent, isHeader, showKbdHint, clear } = args;
  if (isPending) {
    return (
      <Spinner
        className="size-4 text-muted-foreground"
        aria-label="Searching\u2026"
      />
    );
  }
  if (hasContent) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-5"
        aria-label="Clear search"
        onClick={() => clear()}
      >
        <XIcon className="size-3.5" />
      </Button>
    );
  }
  if (isHeader && showKbdHint) {
    return (
      <Kbd
        aria-hidden="true"
        className="h-5 px-1.5 text-micro border-primary/40 text-primary/60"
      >
        /
      </Kbd>
    );
  }
  return null;
}

export function SearchInput({ className }: { className?: string }) {
  const { query, type, searchState, setQuery, setType, clear, submit } = useSearch();

  const headerInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  // Publish the HEADER <input> element to the shared searchInputRef on
  // mount so Plan 07's BrowseToolbar "Search within" can focus without DOM
  // queries (fix #8). Clean up on unmount. Only the header instance
  // publishes — the mobile Sheet input is ephemeral and shouldn't be a
  // focus target across component boundaries.
  useEffect(() => {
    const node = headerInputRef.current;
    searchInputRef.current = node;
    return () => {
      if (searchInputRef.current === node) {
        searchInputRef.current = null;
      }
    };
  }, []);

  // Global `/` shortcut — focus + prevent the character. Focuses whichever
  // input is currently live: mobile sheet input if open, else header input.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editable = target?.isContentEditable;
      if (tag === "input" || tag === "textarea" || editable) {
        return;
      }
      e.preventDefault();
      const live = mobileOpen ? mobileInputRef.current : headerInputRef.current;
      live?.focus();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  const effectiveType = type === "auto" && query.length >= 2 ? detectHint(query) : type;
  const badgeLabel =
    effectiveType !== "auto" && query.length >= 2 ? TYPE_LABEL[effectiveType] : null;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      clear();
      headerInputRef.current?.blur();
      mobileInputRef.current?.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  const isPending = searchState === "loading";
  const hasContent = query.length > 0;
  const showKbdHint = !hasContent && !focused;

  function renderInput({ isHeader }: RenderInputArgs) {
    const refToUse = isHeader ? headerInputRef : mobileInputRef;
    const describedById = isHeader ? "search-input-hint" : "search-input-hint-mobile";
    return (
      <div
        className={cn(
          "relative flex items-center gap-2 h-9",
          isHeader ? "w-[280px] md:w-[280px] lg:w-[360px] xl:w-[440px]" : "w-full",
          className,
        )}
      >
        <SearchIcon
          className="absolute left-2.5 size-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <Input
          ref={refToUse}
          type="search"
          aria-label="Search structures across all extractions"
          aria-describedby={describedById}
          placeholder="Search structures…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            "h-9 pl-8 text-body transition-[padding]",
            hasContent ? "pr-[7.5rem]" : "pr-16",
          )}
        />
        <span id={describedById} className="sr-only">
          Press slash to focus search from anywhere. Press Escape to clear.
        </span>
        <div className="absolute right-1.5 flex items-center gap-1">
          {badgeLabel && (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Detected type: ${badgeLabel}. Click to override.`}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                  />
                }
              >
                <Badge variant="secondary" className="h-5 px-1.5 text-micro font-semibold">
                  {badgeLabel}
                </Badge>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 flex flex-col gap-2 p-3">
                <p className="text-micro font-semibold">Detected type</p>
                {(["inchi_key", "formula", "smiles", "substructure"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`search-type-${isHeader ? "header" : "mobile"}`}
                      checked={type === t}
                      onChange={() => setType(t)}
                    />
                    <span className="text-caption">{TYPE_LABEL[t]}</span>
                  </label>
                ))}
                <button
                  type="button"
                  className="text-micro text-primary underline-offset-2 hover:underline mt-2 self-start"
                  onClick={() => setType("auto")}
                >
                  Reset to auto-detect
                </button>
              </PopoverContent>
            </Popover>
          )}
          {hasContent && (
            <Button
              type="button"
              size="xs"
              onClick={() => submit()}
              aria-label="Submit search"
              className={cn(
                "h-6 gap-1 px-2 rounded-full text-micro font-semibold",
                "bg-[#0071e3] text-white hover:bg-[#0077ed]",
                "dark:bg-[#0a84ff] dark:hover:bg-[#409cff]",
                "shadow-[0_1px_2px_rgba(0,113,227,0.25)]",
              )}
            >
              <SearchIcon className="size-3" />
              Search
            </Button>
          )}
          {renderTrailingAffordance({ isPending, hasContent, isHeader, showKbdHint, clear })}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop header-inlined input (md+) — owns searchInputRef */}
      <div className="hidden md:flex">{renderInput({ isHeader: true })}</div>
      {/* Mobile: SearchIcon trigger + top Sheet with an independent input */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" />}
        >
          <SearchIcon className="size-5" />
        </SheetTrigger>
        <SheetContent side="top" className="max-h-[85vh] overflow-y-auto">
          <div className="mt-4">{renderInput({ isHeader: false })}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
