/**
 * SearchInput — structure search box that sits on the Browse and History
 * pages (search is only useful where there is extracted data to search).
 *
 * Features:
 *  - `/` keyboard shortcut focuses (outside other text inputs)
 *  - `Esc` clears + blurs
 *  - Type-detection badge appears once input ≥ 2 chars; click opens
 *    override Popover with radio items
 *  - Optional `scope`: typing then sets query + scope together, so the very
 *    first request already targets e.g. the extraction being browsed
 *  - SVG rendering of results lives in SearchResults — this file
 *    only drives the useSearch hook
 */
import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSearch } from "@/context/SearchContext";
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

/**
 * Trailing affordance inside the search input — one of:
 *   loading spinner, clear-button, keyboard hint, or nothing.
 */
function renderTrailingAffordance(args: {
  isPending: boolean;
  hasContent: boolean;
  showKbdHint: boolean;
  clear: () => void;
}) {
  const { isPending, hasContent, showKbdHint, clear } = args;
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
  if (showKbdHint) {
    return (
      <Kbd aria-hidden="true" className="h-5 px-1.5 text-micro border-primary/40 text-primary/60">
        /
      </Kbd>
    );
  }
  return null;
}

interface SearchInputProps {
  /** Extra classes for the pill (width, flex behaviour). */
  className?: string;
  /** Search scope applied as the user types ("global" or "extraction:<id>").
   *  Omit to keep whatever scope the shared search state already has. */
  scope?: string;
  /** Accessible name; defaults to searching across all extractions. */
  ariaLabel?: string;
}

export function SearchInput({
  className,
  scope,
  ariaLabel = "Search structures across all extractions",
}: SearchInputProps) {
  const {
    query,
    type,
    searchState,
    stereo,
    queryValidity,
    setQuery,
    setQueryAndScope,
    setType,
    setStereo,
    clear,
    submit,
  } = useSearch();

  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  // Name the query types so the box guides the user on WHAT to search by.
  // Auto-detect covers formula / SMILES / InChIKey; substructure is a manual
  // type toggle, so it's omitted here to avoid implying you can just type it.
  const placeholder = "Search by formula, SMILES, or InChIKey…";

  // `/` shortcut — focus + prevent the character, unless typing elsewhere.
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
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

  function handleChange(value: string) {
    if (scope === undefined) setQuery(value);
    else setQueryAndScope(value, scope);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      clear();
      inputRef.current?.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  const isPending = searchState === "loading";
  const hasContent = query.length > 0;
  const showKbdHint = !hasContent && !focused;

  return (
    <div
      // Neomorphic pill with an inset shadow so the search reads as a carved
      // divot in the page surface.
      data-slot="search-input-neu"
      className={cn(
        "relative flex h-10 w-full min-w-0 items-center gap-2 rounded-full bg-surface px-4",
        "shadow-[var(--shadow-neu-inset)]",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0",
        className,
      )}
    >
      <SearchIcon
        className="size-4 shrink-0 text-foreground-muted pointer-events-none"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        aria-label={ariaLabel}
        aria-describedby="search-input-hint"
        placeholder={placeholder}
        title={placeholder}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        data-slot="input"
        className={cn(
          "min-w-0 flex-1 bg-transparent text-body-sm text-foreground outline-none",
          "placeholder:text-foreground-muted",
          // The box draws its own Clear button; hide the browser's duplicate.
          "[&::-webkit-search-cancel-button]:appearance-none",
          hasContent ? "pr-20" : "pr-10",
        )}
      />
      <span id="search-input-hint" className="sr-only">
        Press slash to focus search. Press Escape to clear.
      </span>
      <div className="absolute right-2 flex items-center gap-1">
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
                    name="search-type"
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
        {renderTrailingAffordance({ isPending, hasContent, showKbdHint, clear })}
      </div>
    </div>
  );
}
