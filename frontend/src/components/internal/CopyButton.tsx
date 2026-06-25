/**
 * CopyButton — shared icon button that copies `value` to the clipboard and
 * flashes a check icon for 2 seconds. Used in StructureDetail, StructureSheet,
 * ReactionSheet, ReactionCard, StructureCard, and StructureTable.
 *
 * All consumers rely on the same XSS-safe `safeClipboardText` sanitiser (SEC-8)
 * so clipboard payloads cannot contain CR/LF/NUL control characters.
 *
 * Pass `stopPropagation` for card/row contexts where a parent click handler
 * must not fire.
 */
import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { safeClipboardText } from "@/lib/safeStrings";
import { cn } from "@/lib/utils";

export interface CopyButtonProps {
  /** Text to place on the clipboard (sanitised by safeClipboardText). */
  value: string;
  /** Human-readable label used in the aria-label ("Copy {label} to clipboard"). */
  label: string;
  /** Whether to call e.stopPropagation() — true inside clickable cards/rows. */
  stopPropagation?: boolean;
  /** Extra classes merged into the Button. */
  className?: string;
  /** Tint the copy icon muted (card/row variant) vs inheriting colour. */
  mutedIcon?: boolean;
}

export function CopyButton({
  value,
  label,
  stopPropagation = false,
  className,
  mutedIcon = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy(e: React.MouseEvent) {
    if (stopPropagation) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(safeClipboardText(value));
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the text and copy manually.");
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Copied!" : `Copy ${label} to clipboard`}
      onClick={handleCopy}
      className={cn(stopPropagation && "shrink-0", className)}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-primary" aria-hidden="true" />
      ) : (
        <CopyIcon
          className={cn("size-3.5", mutedIcon && "text-muted-foreground")}
          aria-hidden="true"
        />
      )}
    </Button>
  );
}
