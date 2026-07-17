/**
 * ExtractionSummary — compact post-upload bar showing filename, structure
 * count, extraction time, an "Upload another file" button, and an optional
 * dismissible amber warning banner.
 *
 * Implements the summary bar and the warning banner.
 */
import { useState } from "react";
import { AlertTriangleIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription, AlertAction } from "@/components/ui/alert";
import { CdxViewerDialog } from "@/components/CdxViewerDialog";
import type { ExtractionResponse } from "@/types/chemistry";

export interface ExtractionSummaryProps {
  /** Full extraction response to display summary for */
  response: ExtractionResponse;
  /** Called when user clicks "Upload another file" */
  onReset: () => void;
}

/**
 * Format milliseconds as a human-readable seconds string (e.g. "1.5s").
 */
function formatExtractionTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Pluralize a count with singular/plural labels (e.g. "1 structure", "3 structures").
 */
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

/**
 * ExtractionSummary — compact one-line bar showing extraction metadata and a
 * primary "Upload another file" action.
 *
 * Renders an amber warning Alert when `response.warnings.length > 0`. The
 * alert can be dismissed and will not reappear until the component is remounted.
 * Warning text is rendered as React text nodes (auto-escaped HTML).
 */
export function ExtractionSummary({ response, onReset }: ExtractionSummaryProps) {
  const [warningsDismissed, setWarningsDismissed] = useState(false);

  return (
    <div>
      {/* Summary bar */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-caption text-muted-foreground tracking-[-0.016em]">
          {response.filename}
          {" · "}
          {pluralize(response.structure_count, "structure", "structures")}
          {" · "}
          {formatExtractionTime(response.extraction_time_ms)}
        </p>
        <div className="flex items-center gap-2">
          {/* extraction_id is optional on ExtractionResponse (nullable in the
              wire contract elsewhere in the app) — only render the trigger
              when there's an id to render from. */}
          {response.extraction_id != null && (
            <CdxViewerDialog extractionId={response.extraction_id} />
          )}
          <Button variant="default" className="rounded-full" onClick={onReset}>
            Upload another file
          </Button>
        </div>
      </div>

      {/* Amber warning Alert — only shown when warnings exist and not dismissed */}
      {!warningsDismissed && response.warnings.length > 0 && (
        <Alert className="mt-4 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
          <AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>
            {response.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </AlertDescription>
          <AlertAction>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss warning"
              onClick={() => setWarningsDismissed(true)}
            >
              <XIcon className="size-3.5" />
            </Button>
          </AlertAction>
        </Alert>
      )}
    </div>
  );
}
