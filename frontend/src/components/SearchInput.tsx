/**
 * SearchInput — inline global search box for AppHeader.
 *
 * Features:
 *  - `/` keyboard shortcut focuses (outside other text inputs)
 *  - `Esc` clears + blurs
 *  - Type-detection badge appears once input ≥ 2 chars; click opens
 *    override Popover with radio items
 *  - Mobile (< md): icon-only trigger; tap opens Sheet side="top" with the
 *    full input
 *  - Publishes its underlying <input> element to `@/lib/searchFocus`
 *    (searchInputRef.current) on mount so the BrowseToolbar
 *    "Search within" can focus it without DOM-querying by aria-label.
 *  - SVG rendering of results lives in SearchResults — this file
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
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { useSearch } from "@/context/SearchContext";
import { searchInputRef } from "@/lib/searchFocus";
import type { SearchType } from "@/types/search";
import { cn } from "@/lib/utils";
import { isRealInchiKey } from "@/lib/inchi";

const FORMULA_RE = /^([A-Z][a-z]?\d*)+$/;

const TYPE_LABEL: Record<Exclude<SearchType, "auto">, string> = {
  inchi_key: "InChI key",
  formula: "Molecular formula",
  smiles: "SMILES",
  substructure: "Substructure",
};

/** Front-end pre-classification hint — authoritative detection is server-side.
 *  Accepts a full <14>-<10>-<1> InChIKey or a PubChem-style partial prefix. */
function detectHint(raw: string): Exclude<SearchType, "auto"> {
  const s = raw.trim();
  if (isRealInchiKey(s.toUpperCase())) return "inchi_key";
  if (FORMULA_RE.test(s)) return "formula";
  return "smiles";
}

interface RenderInputArgs {
  /** Pass `true` for the header-inlined input so the shared searchInputRef
   *  is published on mount. The mobile Sheet copy passes `false` — it does
   *  NOT need ref sharing since "Search within" always focuses
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
    return <Spinner className="size-4 text-muted-foreground" aria-label="Searching\u2026" />;
  }
  if (hasContent) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => clear()}>
        <XIcon className="size-3.5" />
      </Button>
    );
  }
  if (isHeader && showKbdHint) {
    return (
      <Kbd aria-hidden="true" className="h-5 px-1.5 text-micro border-primary/40 text-primary/60">
        /
      </Kbd>
    );
  }
  return null;
}

export function SearchInput({ className }: { className?: string }) {
  const {
    query,
    type,
    searchState,
    stereo,
    queryValidity,
    setQuery,
    setType,
    setStereo,
    clear,
    submit,
  } = useSearch();

  const headerInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  // Publish the HEADER <input> element to the shared searchInputRef on
  // mount so the BrowseToolbar "Search within" can focus without DOM
  // queries. Clean up on unmount. Only the header instance
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

  // For substructure queries, surface live parse-validation state on the
  // badge. Invalid → red destructive; valid → language (SMILES/SMARTS);
  // anything else falls back to the existing detected-type label.
  const validityBadge: {
    label: string;
    tone: "destructive" | "secondary";
    tooltip: string | null;
  } | null =
    type === "substructure" && queryValidity.state === "invalid"
      ? { label: "Invalid", tone: "destructive", tooltip: queryValidity.error }
      : type === "substructure" && queryValidity.state === "valid"
        ? { label: queryValidity.language.toUpperCase(), tone: "secondary", tooltip: null }
        : badgeLabel
          ? { label: badgeLabel, tone: "secondary", tooltip: null }
          : null;

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
        // Header variant: neomorphic pill with inset shadow so the search
        // reads as a carved divot on the glass header. Mobile (sheet)
        // variant keeps the plain form-tier Input — the sheet already has
        // its own glass surface and neumorphism would fight the tint.
        data-slot={isHeader ? "search-input-neu" : undefined}
        className={cn(
          "relative flex items-center gap-2",
          isHeader
            ? [
                "h-10 rounded-full bg-surface px-4",
                "shadow-[var(--shadow-neu-inset)]",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0",
                // 280px must hold through lg: at 1024px the nav pill +
                // theme switch leave no room for a wider pill (it used to
                // leak 76px past the viewport). min-w-0 + shrink let the
                // pill compress instead of overflowing if space runs out.
                "w-[280px] min-w-0 shrink xl:w-[440px]",
              ]
            : "h-9 w-full",
          className,
        )}
      >
        <SearchIcon
          className={cn(
            "size-4 text-foreground-muted pointer-events-none",
            isHeader ? "shrink-0" : "absolute left-2.5",
          )}
          aria-hidden="true"
        />
        {isHeader ? (
          <input
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
            data-slot="input"
            className={cn(
              "min-w-0 flex-1 bg-transparent text-body text-foreground outline-none",
              "placeholder:text-foreground-muted",
              hasContent ? "pr-20" : "pr-10",
            )}
          />
        ) : (
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
              hasContent ? "pr-20" : "pr-16",
            )}
          />
        )}
        <span id={describedById} className="sr-only">
          Press slash to focus search from anywhere. Press Escape to clear.
        </span>
        <div className={cn("absolute flex items-center gap-1", isHeader ? "right-2" : "right-1.5")}>
          {validityBadge && (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label={
                      validityBadge.tone === "destructive"
                        ? `Invalid query${validityBadge.tooltip ? `: ${validityBadge.tooltip}` : ""}. Click to override type.`
                        : `Detected type: ${validityBadge.label}. Click to override.`
                    }
                    title={validityBadge.tooltip ?? undefined}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                  />
                }
              >
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-5 px-1.5 text-micro font-semibold",
                    validityBadge.tone === "destructive" &&
                      "bg-destructive text-destructive-foreground destructive",
                  )}
                >
                  {validityBadge.label}
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
                {type === "substructure" && (
                  <>
                    <div className="border-t border-border my-1" />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stereo}
                        onChange={(e) => setStereo(e.target.checked)}
                        aria-label="Match stereochemistry"
                      />
                      <span className="text-caption">Match stereochemistry</span>
                    </label>
                    <p className="text-micro text-muted-foreground">
                      When off (default), {"@"}, {"/"}, {"\\"} in the query are ignored so both
                      enantiomers match.
                    </p>
                  </>
                )}
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
        {/* Compact mobile search bar: a single padded row — the input fills
            the width with an explicit Close beside it. No scroll container:
            it's one row, so max-h/overflow-y would only add dead space. The
            Sheet's default corner close is suppressed so it can't float over
            the input. */}
        <SheetContent side="top" showCloseButton={false} className="p-4">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">{renderInput({ isHeader: false })}</div>
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close search"
                  className="shrink-0"
                />
              }
            >
              <XIcon className="size-5" />
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
