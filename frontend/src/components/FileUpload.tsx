import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  FileIcon,
  SparklesIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StardustButton } from "@/components/ui/stardust-button";

/**
 * FileUpload — Phase 3 Liquid Glass wizard Step 1 (Task 10 rewrite).
 *
 * Composes the large dashed drop zone with the queue list + CTA that lives
 * inside the Wizard's Upload step. Preserves the single-file fast-path
 * behaviour: if exactly one file is dropped/selected with an empty queue,
 * `onExtract` is called directly (routes through the fast single-file
 * endpoint). Otherwise the files accumulate in a queue and `onStartBatch`
 * fires when the user clicks the primary CTA.
 *
 * Prop contract is preserved for `ExtractPage`:
 *   - `onExtract(File)`         — single-file fast-path.
 *   - `onStartBatch(File[])`    — batch pipeline entry (SSE progress).
 *   - `isLoading`               — surfaces spinner + filename status when
 *                                 the single-file path is active. Preserved
 *                                 for legacy tests; the Wizard consumer
 *                                 renders Step 2 in place of Step 1 when
 *                                 `isLoading` goes true, so this branch is
 *                                 seldom seen post-Task-10.
 *
 * `data-slot` additions:
 *   - `data-slot="upload-step"`        (root wrapper)
 *   - `data-slot="drop-zone"`          (the 400-px dashed drop target)
 *   - `data-slot="file-list"`          (queued files list)
 *   - `data-slot="upload-extract-cta"` (primary CTA advancing Step 2)
 *
 * Validation rules (preserved from the Phase 2 implementation):
 *   - `.cdx` or `.cdxml` extension only (wrong ext toast-rejects outright).
 *   - 50 MB per file — oversize files still land in the queue with an
 *     inline warning and disable the CTA.
 *   - 20 files max per batch — overflow toasts "Batch limit reached…".
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

function validateExtension(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".cdx") && !name.endsWith(".cdxml")) {
    return "Only .cdx and .cdxml files are supported.";
  }
  return null;
}

function validateFile(file: File): string | null {
  const extError = validateExtension(file);
  if (extError) return extError;
  if (file.size > MAX_FILE_BYTES) {
    return "File exceeds the 50 MB limit.";
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

  // ── Loading state — preserved for legacy rendering paths ────────────────
  if (isLoading) {
    const sizeSuffix =
      loadingFileSize !== undefined ? ` (${formatBytes(loadingFileSize)})` : "";
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

  function addFilesToQueue(incoming: File[]) {
    // Single-file fast-path: exactly one file dropped/selected with an
    // empty queue → route through the single-file endpoint.
    if (incoming.length === 1 && queuedFiles.length === 0) {
      const file = incoming[0];
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        return;
      }
      onExtract(file);
      return;
    }

    setQueuedFiles((prev) => {
      const available = MAX_BATCH_FILES - prev.length;
      if (available <= 0) {
        toast.error("Batch limit reached. Maximum 20 files per batch.");
        return prev;
      }

      const toAdd: File[] = [];
      for (const file of incoming) {
        const extError = validateExtension(file);
        if (extError) {
          toast.error(extError);
          continue;
        }
        if (toAdd.length < available) toAdd.push(file);
      }

      if (
        prev.length + toAdd.length >= MAX_BATCH_FILES &&
        incoming.length > available
      ) {
        toast.error("Batch limit reached. Maximum 20 files per batch.");
      }

      return [...prev, ...toAdd];
    });
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
  const ctaLabel = hasQueuedFiles
    ? `Extract ${queuedFiles.length} file${queuedFiles.length !== 1 ? "s" : ""}`
    : "";

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
        data-drag-over={isDragOver ? "true" : undefined}
        className={cn(
          "relative flex min-h-[400px] w-full flex-col items-center justify-center gap-4 p-8",
          "rounded-xl border-2 border-dashed bg-surface-elevated",
          "transition-colors duration-200",
          "border-border has-[button:hover]:border-primary/40",
          "data-[drag-over=true]:border-primary data-[drag-over=true]:bg-accent/40",
        )}
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
        <UploadCloudIcon
          aria-hidden="true"
          className="size-12 text-foreground-muted"
        />
        <div className="space-y-2 text-center">
          <p className="text-base font-medium text-foreground">
            Drag &amp; drop your CDX or CDXML file
          </p>
          <p className="text-sm text-foreground-muted">or click to browse</p>
        </div>
        <StardustButton
          aria-label="Upload CDX or CDXML file"
          label="Extract structures"
          onClick={() => fileInputRef.current?.click()}
        />
        <p className="text-xs text-foreground-muted">
          Supports .cdx and .cdxml &mdash; up to 50 MB &middot; 20 files per batch
        </p>
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
                  <FileIcon
                    className="size-4 shrink-0 text-foreground-muted"
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-sm text-foreground">
                    {file.name}
                  </span>
                  {oversize && (
                    <AlertTriangleIcon
                      className="size-4 shrink-0 text-destructive"
                      aria-label="File exceeds the 50 MB limit"
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
