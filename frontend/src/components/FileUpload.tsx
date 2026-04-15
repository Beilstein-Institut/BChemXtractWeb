import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  UploadIcon,
  XCircleIcon,
  FileIcon,
  XIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

export interface FileUploadProps {
  /** "single" preserves the original one-file drop zone; "batch" enables multi-file queue */
  mode?: "single" | "batch";
  /** Called with the validated File when user selects or drops a valid file (single mode) */
  onExtract: (file: File) => void;
  /** When true, hides drop zone and shows spinner + loading message (single mode) */
  isLoading: boolean;
  /** Filename shown in the loading message (e.g. "sample.cdx") */
  loadingFilename?: string;
  /** File size in bytes for the loading message */
  loadingFileSize?: number;
  /** Batch-mode only: called with validated File[] when user clicks "Start batch" */
  onStartBatch?: (files: File[]) => void;
  /** Batch-mode only: when true, hides the queue list (batch is in progress) */
  isBatchProcessing?: boolean;
}

/**
 * Validates a file's extension. Returns an error string if invalid, null if valid.
 * Used in both single and batch mode to check file type.
 */
function validateExtension(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".cdx") && !name.endsWith(".cdxml")) {
    return "Only .cdx and .cdxml files are supported.";
  }
  return null;
}

/**
 * Validates a file against allowed extensions and maximum size.
 * Returns an error string on violation, or null if the file is valid.
 * Note: this is a UX-only check — backend validates content via magic bytes (D-06).
 * Used in single mode only (batch mode shows oversize warning inline in queue).
 */
function validateFile(file: File): string | null {
  const extError = validateExtension(file);
  if (extError) return extError;
  if (file.size > 52_428_800) {
    return "File exceeds the 50 MB limit.";
  }
  return null;
}

/**
 * Formats bytes into a human-readable string (KB or MB).
 */
function formatBytes(bytes: number): string {
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

const MAX_BATCH_FILES = 20;

/**
 * FileUpload — Drop zone component implementing D-01 through D-05.
 *
 * In "single" mode (default): accepts one file, calls onExtract.
 * In "batch" mode: accepts multiple files up to MAX_BATCH_FILES, shows a file
 * queue with remove buttons, and calls onStartBatch when the user clicks
 * "Start batch".
 *
 * The component is controlled: it receives onExtract/onStartBatch and
 * isLoading/isBatchProcessing as props so the parent (App) can own the hook
 * state and co-ordinate results display.
 */
export function FileUpload({
  mode = "single",
  onExtract,
  isLoading,
  loadingFilename,
  loadingFileSize,
  onStartBatch,
  isBatchProcessing = false,
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragReject, setIsDragReject] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // Batch-mode queue
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);

  const zoneClasses = cn(
    "min-h-[220px] rounded-xl flex flex-col items-center justify-center gap-4 p-8",
    "cursor-pointer transition-all duration-200",
    "border-2 border-dashed",
    isDragReject
      ? "border-destructive bg-destructive/5"
      : isDragOver
      ? "border-primary bg-primary/10 scale-[1.01]"
      : isHovering
      ? "border-primary bg-primary/5"
      : "border-border bg-background"
  );

  const iconColor =
    isDragReject
      ? "text-destructive"
      : isDragOver || isHovering
      ? "text-primary"
      : "text-muted-foreground";

  const headlineText =
    mode === "batch"
      ? isDragOver && !isDragReject
        ? "Drop them here"
        : "Drag & drop your CDX or CDXML files"
      : isDragOver && !isDragReject
      ? "Drop it here"
      : "Drag & drop your CDX or CDXML file";

  // ── Single-mode drop handler ───────────────────────────────────────────────
  function handleDropSingle(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    setIsDragReject(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 1) {
      toast.error("Upload one file at a time.");
      return;
    }
    if (files.length === 0) return;
    const error = validateFile(files[0]);
    if (error) {
      toast.error(error);
      return;
    }
    onExtract(files[0]);
  }

  // ── Batch-mode drop handler ────────────────────────────────────────────────
  function handleDropBatch(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    setIsDragReject(false);
    const incoming = Array.from(e.dataTransfer.files);
    addFilesToQueue(incoming);
  }

  function addFilesToQueue(incoming: File[]) {
    // Smart single-file detection: if exactly one file is dropped/selected
    // and the queue is empty, route through the fast single-file extraction
    // endpoint (POST /api/extract) instead of the Celery batch pipeline.
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
      const currentCount = prev.length;
      const available = MAX_BATCH_FILES - currentCount;

      if (available <= 0) {
        toast.error("Batch limit reached. Maximum 20 files per batch.");
        return prev;
      }

      const toAdd: File[] = [];
      for (const file of incoming) {
        // Wrong extension: reject immediately with toast (never show in queue)
        const extError = validateExtension(file);
        if (extError) {
          toast.error(extError);
          continue;
        }
        // Valid extension (may be oversize — shown in queue with inline warning)
        if (toAdd.length < available) {
          toAdd.push(file);
        }
      }

      if (currentCount + toAdd.length >= MAX_BATCH_FILES && incoming.length > available) {
        toast.error("Batch limit reached. Maximum 20 files per batch.");
      }

      return [...prev, ...toAdd];
    });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (mode === "batch") {
      handleDropBatch(e);
    } else {
      handleDropSingle(e);
    }
  }

  // ── File input change ──────────────────────────────────────────────────────
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    if (mode === "batch") {
      addFilesToQueue(Array.from(fileList));
    } else {
      const file = fileList[0];
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        return;
      }
      onExtract(file);
    }

    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  // ── Loading state (single mode only) ──────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <Spinner className="size-12 text-primary" />
        <p aria-live="polite" className="text-body text-muted-foreground">
          {loadingFilename
            ? `Extracting structures from ${loadingFilename}${
                loadingFileSize !== undefined
                  ? ` (${formatBytes(loadingFileSize)})`
                  : ""
              }…`
            : "Extracting structures…"}
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasOversizeFile = queuedFiles.some((f) => f.size > 52_428_800);

  return (
    <div>
      <input
        type="file"
        accept=".cdx,.cdxml"
        multiple={mode === "batch"}
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileInputChange}
      />

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label={
          mode === "batch"
            ? "Upload CDX or CDXML files"
            : "Upload CDX or CDXML file"
        }
        className={zoneClasses}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => {
          setIsDragOver(false);
          setIsDragReject(false);
        }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
      >
        {isDragReject ? (
          <XCircleIcon size={40} className={iconColor} />
        ) : (
          <UploadIcon size={40} className={iconColor} />
        )}
        <p className="text-sub-heading font-normal text-foreground tracking-tight">{headlineText}</p>
        {mode === "batch" ? (
          <>
            {!isDragOver && (
              <p className="text-body text-muted-foreground">
                or click to browse · up to 20 files · 50 MB each
              </p>
            )}
            {queuedFiles.length > 0 && (
              <Badge variant="secondary">{queuedFiles.length} files selected</Badge>
            )}
          </>
        ) : (
          <>
            {!isDragOver && (
              <p className="text-body text-muted-foreground">or click to browse</p>
            )}
            <p className="text-caption text-muted-foreground">
              Supports .cdx and .cdxml — up to 50 MB
            </p>
            <Button
              variant="default"
              size="lg"
              className="rounded-full px-6 py-2"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Extract structures
            </Button>
          </>
        )}
      </div>

      {/* Batch-mode: file queue list + Start batch button */}
      {mode === "batch" && queuedFiles.length > 0 && !isBatchProcessing && (
        <div className="mt-4">
          <ul className="space-y-1 rounded-xl bg-card shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px] overflow-hidden">
            {queuedFiles.map((file) => {
              const oversize = file.size > 52_428_800;
              return (
                <li
                  key={`${file.name}-${file.size}`}
                  className={cn(
                    "min-h-[48px] flex items-center gap-2 px-4 py-2 hover:bg-muted/30 transition-colors",
                    oversize && "ring-destructive/40"
                  )}
                >
                  <FileIcon size={16} className="text-muted-foreground shrink-0" />
                  <span className="text-body truncate flex-1">{file.name}</span>
                  {oversize && (
                    <AlertTriangleIcon
                      size={14}
                      className="text-destructive shrink-0"
                    />
                  )}
                  <span
                    className={cn(
                      "text-micro shrink-0",
                      oversize ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {formatBytes(file.size)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={"Remove " + file.name}
                    onClick={() =>
                      setQueuedFiles((prev) => prev.filter((f) => f !== file))
                    }
                  >
                    <XIcon size={16} className="text-muted-foreground hover:text-foreground" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <Separator className="my-3" />
          <Button
            variant="default"
            size="lg"
            className="w-full rounded-full"
            disabled={queuedFiles.length === 0 || hasOversizeFile}
            onClick={() => {
              onStartBatch?.(queuedFiles);
              setQueuedFiles([]);
            }}
          >
            Start batch
          </Button>
        </div>
      )}
    </div>
  );
}
