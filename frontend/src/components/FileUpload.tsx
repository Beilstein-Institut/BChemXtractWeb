import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangleIcon, FileIcon, SparklesIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StardustButton } from "@/components/ui/stardust-button";

/**
 * FileUpload — drop-zone craft pass.
 *
 * Composes the dashed drop zone with the queue list + CTA inside the Wizard's
 * Upload step. Single-file fast-path: one file dropped/selected with an empty
 * queue routes through `onExtract` directly. Otherwise files accumulate in a
 * queue and `onStartBatch` fires when the user clicks "Extract N files".
 *
 * The drop-zone is a small state machine driven by two derived attributes
 * the styling reads via `data-*` selectors:
 *
 *   data-state  | idle | drag-over | reject
 *   data-queue  | empty | building | full
 *
 * Visual language follows DESIGN.md neumorphism tokens:
 *   - idle      → recessed `--shadow-neu-inset`
 *   - drag-over → lifted `--shadow-neu-raised`, primary border, icon tilts
 *   - reject    → transient destructive border + tint (~280 ms)
 *   - full      → muted destructive border, no shadow change
 *
 * A faint always-on dot pattern (primary-hue tinted at ~7 %) sits behind
 * the content so the surface reads as chemistry-adjacent without
 * illustrating chemistry.
 *
 * Prop contract is preserved for `ExtractPage`:
 *   - `onExtract(File)`         — single-file fast-path.
 *   - `onStartBatch(File[])`    — batch pipeline entry (SSE progress).
 *   - `isLoading`               — legacy single-file loading panel; the
 *                                 Wizard renders Step 2 in place of Step 1
 *                                 once `isLoading` goes true, so this branch
 *                                 is rarely seen post-Task-10 but kept for
 *                                 legacy tests.
 *
 * `data-slot` additions:
 *   - `data-slot="upload-step"`        (root wrapper)
 *   - `data-slot="drop-zone"`          (state-driven drop target)
 *   - `data-slot="file-list"`          (queued files list)
 *   - `data-slot="upload-extract-cta"` (primary CTA advancing Step 2)
 *
 * Validation rules:
 *   - `.cdx` or `.cdxml` extension only.
 *   - 50 MB per file (matches backend cap).
 *   - 20 files max per batch.
 *   - Each rejected drop flashes the surface once and shows one toast,
 *     even when multiple invalid files are dropped at once.
 */
export interface FileUploadProps {
  /** Called with a validated File when the single-file fast-path fires. */
  onExtract: (file: File) => void;
  /** Active when the single-file endpoint is mid-flight. */
  isLoading: boolean;
  /** Filename shown in the legacy loading panel. */
  loadingFilename?: string;
  /** File size (bytes) for the legacy loading panel. */
  loadingFileSize?: number;
  /** Called with File[] when the "Extract N files" CTA fires. */
  onStartBatch?: (files: File[]) => void;
  /** When true, hides the queue list (batch is already processing). */
  isBatchProcessing?: boolean;
}

const MAX_FILE_BYTES = 52_428_800; // 50 MB — backend enforces the same limit.
const MAX_BATCH_FILES = 20;
// Surface flash duration on rejected drops. Long enough to register,
// short enough to feel like a microbeat, not a celebration.
const REJECT_FLASH_MS = 280;
const BATCH_FULL_MESSAGE =
  "Batch limit hit (20 files). Remove some, or run them as separate batches.";

function validateExtension(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".cdx") && !name.endsWith(".cdxml")) {
    return "File type not supported. Drop a .cdx or .cdxml file.";
  }
  return null;
}

function validateFile(file: File): string | null {
  const extError = validateExtension(file);
  if (extError) return extError;
  if (file.size > MAX_FILE_BYTES) {
    return "File exceeds 50 MB. Split or compress before uploading.";
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function FileUpload({
  onExtract,
  isLoading,
  loadingFilename,
  loadingFileSize,
  onStartBatch,
  isBatchProcessing = false,
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [rejectFlash, setRejectFlash] = useState(false);
  const rejectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rejectTimerRef.current !== null) {
        window.clearTimeout(rejectTimerRef.current);
      }
    };
  }, []);

  // ── Loading state — preserved for legacy rendering paths ────────────────
  if (isLoading) {
    const sizeSuffix = loadingFileSize !== undefined ? ` (${formatBytes(loadingFileSize)})` : "";
    const loadingMessage = loadingFilename
      ? `Extracting structures from ${loadingFilename}${sizeSuffix}\u2026`
      : "Extracting structures\u2026";
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <Spinner className="size-12 text-primary" />
        <p aria-live="polite" className="text-body text-foreground-muted">
          {loadingMessage}
        </p>
      </div>
    );
  }

  function rejectWithError(message: string) {
    toast.error(message);
    if (rejectTimerRef.current !== null) {
      window.clearTimeout(rejectTimerRef.current);
    }
    setRejectFlash(true);
    rejectTimerRef.current = window.setTimeout(() => {
      setRejectFlash(false);
      rejectTimerRef.current = null;
    }, REJECT_FLASH_MS);
  }

  function addFilesToQueue(incoming: File[]) {
    // Single-file fast-path: exactly one file dropped/selected with an empty
    // queue → route through the single-file endpoint.
    if (incoming.length === 1 && queuedFiles.length === 0) {
      const file = incoming[0];
      const error = validateFile(file);
      if (error) return rejectWithError(error);
      onExtract(file);
      return;
    }

    // Batch already at capacity: surface the rejection without entering
    // the queue updater, so the reject flash fires synchronously.
    if (queuedFiles.length >= MAX_BATCH_FILES) {
      return rejectWithError(BATCH_FULL_MESSAGE);
    }

    // Batch path: validate extensions outside the updater, take one
    // toast per drop event (multiple invalid files in the same drop
    // share a single error), then truncate to remaining capacity.
    const available = MAX_BATCH_FILES - queuedFiles.length;
    const validIncoming: File[] = [];
    let firstExtError: string | null = null;
    for (const file of incoming) {
      const extError = validateExtension(file);
      if (extError) {
        if (firstExtError === null) firstExtError = extError;
      } else {
        validIncoming.push(file);
      }
    }

    if (firstExtError !== null) {
      rejectWithError(firstExtError);
    } else if (validIncoming.length > available) {
      rejectWithError(BATCH_FULL_MESSAGE);
    }

    const accepted = validIncoming.slice(0, available);
    if (accepted.length > 0) {
      setQueuedFiles((prev) => [...prev, ...accepted]);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    addFilesToQueue(Array.from(e.dataTransfer.files));
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    addFilesToQueue(Array.from(fileList));
    // Reset input so the same file can be re-selected.
    e.target.value = "";
  }

  function handleRemove(target: File) {
    setQueuedFiles((prev) => prev.filter((f) => f !== target));
  }

  const hasOversizeFile = queuedFiles.some((f) => f.size > MAX_FILE_BYTES);
  const hasQueuedFiles = queuedFiles.length > 0 && !isBatchProcessing;
  const ctaLabel = `Extract ${queuedFiles.length} file${queuedFiles.length === 1 ? "" : "s"}`;

  // Derived state for the drop-zone surface. `data-state` carries the
  // transient interaction signal (drag-over / reject), `data-queue` carries
  // the persistent queue capacity. Both feed the className data-attribute
  // selectors below so style stays declarative.
  let queueState: "empty" | "building" | "full" = "empty";
  if (queuedFiles.length >= MAX_BATCH_FILES) queueState = "full";
  else if (queuedFiles.length > 0) queueState = "building";

  let dropState: "idle" | "drag-over" | "reject" = "idle";
  if (rejectFlash) dropState = "reject";
  else if (isDragOver) dropState = "drag-over";

  return (
    <div data-slot="upload-step" className="space-y-6">
      <input
        type="file"
        accept=".cdx,.cdxml"
        multiple
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileInputChange}
      />

      <div
        data-slot="drop-zone"
        data-state={dropState}
        data-queue={queueState}
        // Legacy attribute retained for any consumer or test still keying on it.
        data-drag-over={isDragOver ? "true" : undefined}
        className={cn(
          "group/zone relative flex w-full flex-col items-center justify-center gap-4 overflow-hidden p-8",
          "rounded-xl border-2 border-dashed",
          // Min-height varies by queue state. Layout-driving property → no transition.
          // Empty zone collapses to 280px on narrow viewports per the brief's
          // mobile guidance.
          "data-[queue=empty]:min-h-[280px] data-[queue=empty]:sm:min-h-[400px]",
          "data-[queue=building]:min-h-[240px] data-[queue=full]:min-h-[240px]",
          // Idle: recessed surface, default border.
          "bg-surface-elevated border-border shadow-[var(--shadow-neu-inset)]",
          // Drag-over: lifted, primary border, accent-tinted background.
          "data-[state=drag-over]:border-primary data-[state=drag-over]:bg-accent/30",
          "data-[state=drag-over]:shadow-[var(--shadow-neu-raised)]",
          // Reject: transient destructive border + tint, no lift.
          "data-[state=reject]:border-destructive data-[state=reject]:bg-destructive/10",
          // Full: muted destructive border, copy carries the rest.
          "data-[queue=full]:border-destructive/60",
          // Hover affordance from any inner button.
          "has-[button:hover]:border-primary/40",
        )}
        style={{
          // Faint molecular-paper dot pattern, primary-hue tinted at ~7%.
          // Always present so the surface reads as chemistry-adjacent
          // without illustrating chemistry.
          backgroundImage:
            "radial-gradient(circle at center, color-mix(in oklch, var(--color-primary) 7%, transparent) 1px, transparent 1.2px)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0",
          // Background-color, border-color, and shadow all transition together.
          // Layout properties (min-height) intentionally do NOT transition.
          // Reduced motion zeroes --motion-medium via tokens.css.
          transitionProperty: "background-color, border-color, box-shadow",
          transitionDuration: "var(--motion-medium)",
          transitionTimingFunction: "var(--ease-out)",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {queueState === "empty" && (
          <>
            <UploadCloudIcon
              aria-hidden="true"
              className="size-12 text-foreground-muted transition-transform duration-200 motion-reduce:transition-none"
              // Cloud tilts -4° when the surface is receiving. Inline style
              // sidesteps Tailwind v4's arbitrary-value JIT, which wasn't
              // emitting the rotate utility reliably from a conditional cn().
              style={{
                transform: dropState === "drag-over" ? "rotate(-4deg)" : undefined,
              }}
            />
            <div className="space-y-2 text-center">
              <p className="text-base font-medium text-foreground">
                {/* Width-based fallback for narrow viewports + touch devices.
                    `(pointer: fine)` would catch real touch but a desktop
                    browser at 375px still reports fine; treating the narrow
                    viewport as mobile is the broader-correct heuristic. */}
                <span className="hidden sm:inline">Drop CDX or CDXML files</span>
                <span className="inline sm:hidden">Choose CDX or CDXML files</span>
              </p>
              <p className="hidden text-sm text-foreground-muted sm:block">or click to browse</p>
            </div>
            <StardustButton
              aria-label="Upload CDX or CDXML file"
              label="Extract structures"
              onClick={() => fileInputRef.current?.click()}
            />
            <p className="text-xs text-foreground-muted">
              Supports .cdx and .cdxml, up to 50 MB. Max 20 files per batch.
            </p>
          </>
        )}

        {queueState === "building" && (
          <>
            <UploadCloudIcon
              aria-hidden="true"
              className="size-10 text-foreground-muted transition-transform duration-200 motion-reduce:transition-none"
              style={{
                transform: dropState === "drag-over" ? "rotate(-4deg)" : undefined,
              }}
            />
            <p className="text-sm font-medium text-foreground">Drop more, or click to add</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => fileInputRef.current?.click()}
            >
              Add files
            </Button>
          </>
        )}

        {queueState === "full" && (
          <>
            <UploadCloudIcon aria-hidden="true" className="size-10 text-foreground-muted/60" />
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium text-foreground">Batch is full (20 files)</p>
              <p className="text-xs text-foreground-muted">Remove some to add more.</p>
            </div>
          </>
        )}
      </div>

      {hasQueuedFiles && (
        <div data-slot="file-list" className="space-y-2">
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {queuedFiles.map((file) => {
              const oversize = file.size > MAX_FILE_BYTES;
              return (
                <li
                  key={`${file.name}-${file.size}`}
                  data-slot="file-row"
                  className={cn(
                    "flex min-h-[48px] items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-muted/40",
                    oversize && "bg-destructive/5",
                  )}
                >
                  <FileIcon className="size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                  <span className="flex-1 truncate text-sm text-foreground">{file.name}</span>
                  {oversize && (
                    <AlertTriangleIcon
                      className="size-4 shrink-0 text-destructive"
                      aria-label="File exceeds 50 MB"
                    />
                  )}
                  <span
                    className={cn(
                      "shrink-0 font-mono text-xs tabular-nums",
                      oversize ? "text-destructive" : "text-foreground-muted",
                    )}
                  >
                    {formatBytes(file.size)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={`Remove ${file.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(file);
                    }}
                  >
                    <XIcon className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button
            data-slot="upload-extract-cta"
            variant="primary"
            size="lg"
            className="w-full rounded-full"
            disabled={hasOversizeFile}
            icon={<SparklesIcon />}
            onClick={() => {
              onStartBatch?.(queuedFiles);
              setQueuedFiles([]);
            }}
          >
            {ctaLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
