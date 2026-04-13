/**
 * StructureCard — a clickable molecule card showing SVG depiction, molecular
 * formula, truncated SMILES, and a clipboard copy button.
 *
 * Clicking the card body opens a StructureDetail dialog. Clicking the copy
 * button copies the SMILES string without opening the dialog (stopPropagation).
 *
 * SVG is rendered as a URL-encoded data URI in an <img> src — never as raw
 * innerHTML — to prevent XSS injection from backend-supplied SVG (T-04-04).
 */
import { useState } from "react";
import { ClipboardIcon, CheckIcon, FlaskConicalIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { StructureDetail } from "@/components/StructureDetail";
import type { SubstanceResponse } from "@/types/chemistry";

export interface StructureCardProps {
  /** Extracted substance data to display */
  substance: SubstanceResponse;
}

/**
 * StructureCard — molecule grid tile.
 *
 * Implements D-07 (thumbnail card), D-08 (molecular formula + SMILES), D-09
 * (dialog trigger), and DISP-04 (copy SMILES to clipboard).
 */
export function StructureCard({ substance }: StructureCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // URL-encode the SVG so it can be safely used as an img src attribute value.
  // This is the only approved rendering method per UI-SPEC.md (T-04-04).
  const svgSrc = substance.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(substance.svg)}`
    : null;

  /**
   * Copy the SMILES string to the clipboard.
   * Calls e.stopPropagation() to prevent the card-click dialog from opening.
   */
  async function handleCopySmiles(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(substance.smiles);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Failed to copy — try selecting the text manually.");
    }
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          aria-label={`View details for ${substance.molecular_formula}`}
          className="cursor-pointer"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setIsDialogOpen(true);
            }
          }}
        >
          <Card className="hover:shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px] transition-shadow duration-200 border-0 overflow-hidden">
            {/* SVG container: 240px fixed height */}
            <div className="h-[240px] flex items-center justify-center bg-background rounded-t-lg p-4">
              {svgSrc ? (
                <img
                  src={svgSrc}
                  alt={`${substance.molecular_formula} structure`}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full bg-muted rounded">
                  <FlaskConicalIcon className="size-8 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Molecule metadata */}
            <CardContent className="space-y-2">
              <p className="text-caption font-semibold text-foreground">
                {substance.molecular_formula}
              </p>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-caption text-muted-foreground truncate max-w-[calc(100%-2rem)]">
                      {substance.smiles}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{substance.smiles}</TooltipContent>
                </Tooltip>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={isCopied ? "Copied!" : "Copy SMILES to clipboard"}
                  onClick={handleCopySmiles}
                >
                  {isCopied ? (
                    <CheckIcon className="size-3.5 text-primary" />
                  ) : (
                    <ClipboardIcon className="size-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogTrigger>

      {/* StructureDetail renders as DialogContent inside the Dialog */}
      <StructureDetail substance={substance} />
    </Dialog>
  );
}
