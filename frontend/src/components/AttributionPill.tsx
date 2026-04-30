import { BoxesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SearchResult } from "@/types/search";
import { cn } from "@/lib/utils";
import { safeDisplayFilename, safePositiveInt } from "@/lib/safeStrings";

export interface AttributionPillProps {
  count: number;
  extractions: SearchResult["extractions"];
  /** Called when the user picks an extraction to navigate to. */
  onView?: (extractionId: number) => void;
  /** Extra classes merged onto the trigger button (e.g. self-start vs centered). */
  className?: string;
}

const PILL_CLASSES = "h-5 px-2 text-micro gap-1 cursor-pointer hover:opacity-90";
const TRIGGER_CLASSES =
  "self-start rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function formatRelative(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function AttributionPill({ count, extractions, onView, className }: AttributionPillProps) {
  if (count <= 0) return null;

  const pillBadge = (
    <Badge variant="secondary" className={PILL_CLASSES}>
      <BoxesIcon className="size-3" aria-hidden="true" />
      {`Found in ${count}`}
    </Badge>
  );

  const sole = count === 1 ? extractions[0] : null;
  const soleId = sole ? safePositiveInt(sole.extraction_id, { fallback: 0 }) : 0;

  if (sole && soleId > 0) {
    return (
      <button
        type="button"
        aria-label={`Found in ${safeDisplayFilename(sole.filename)} — open extraction`}
        onClick={() => onView?.(soleId)}
        className={cn(TRIGGER_CLASSES, className)}
      >
        {pillBadge}
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Found in ${count} extractions — choose one to open`}
            aria-haspopup="dialog"
            className={cn(TRIGGER_CLASSES, className)}
          />
        }
      >
        {pillBadge}
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-2">
        <ul className="flex flex-col gap-1">
          {extractions.map((e) => {
            const id = safePositiveInt(e.extraction_id, { fallback: 0 });
            if (id <= 0) {
              return (
                <li key={e.extraction_id}>
                  <div className="block p-1 text-caption text-muted-foreground">
                    {safeDisplayFilename(e.filename)}
                  </div>
                </li>
              );
            }
            return (
              <li key={e.extraction_id}>
                <button
                  type="button"
                  onClick={() => onView?.(id)}
                  className={cn(
                    "block w-full p-1 rounded text-left hover:text-primary hover:bg-muted/60",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  )}
                >
                  <div className="text-caption text-foreground truncate">
                    {safeDisplayFilename(e.filename)}
                  </div>
                  <div className="text-micro text-muted-foreground">
                    {formatRelative(e.created_at)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
