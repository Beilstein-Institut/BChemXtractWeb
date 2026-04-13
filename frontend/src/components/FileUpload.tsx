import { useRef, useState } from "react";
import { toast } from "sonner";
import { UploadIcon, XCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export interface FileUploadProps {
  /** Called with the validated File when user selects or drops a valid file */
  onExtract: (file: File) => void;
  /** When true, hides drop zone and shows spinner + loading message */
  isLoading: boolean;
  /** Filename shown in the loading message (e.g. "sample.cdx") */
  loadingFilename?: string;
  /** File size in bytes for the loading message */
  loadingFileSize?: number;
}

/**
 * Validates a file against allowed extensions and maximum size.
 * Returns an error string on violation, or null if the file is valid.
 * Note: this is a UX-only check — backend validates content via magic bytes (D-06).
 */
function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".cdx") && !name.endsWith(".cdxml")) {
    return "Only .cdx and .cdxml files are supported.";
  }
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

/**
 * FileUpload — Drop zone component implementing states D-01 (drop zone),
 * D-02 (loading state), and D-04 (toast error handling).
 *
 * The component is controlled: it receives onExtract and isLoading as props
 * so the parent (App) can own the useExtract hook state and co-ordinate
 * the results display.
 */
export function FileUpload({
  onExtract,
  isLoading,
  loadingFilename,
  loadingFileSize,
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragReject, setIsDragReject] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const zoneClasses = cn(
    "min-h-[200px] rounded-xl flex flex-col items-center justify-center gap-4 p-8",
    "cursor-pointer transition-colors duration-150",
    "border-2 border-dashed",
    isDragReject
      ? "border-destructive bg-destructive/5"
      : isDragOver
      ? "border-primary bg-primary/10"
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
    isDragOver && !isDragReject
      ? "Drop it here"
      : "Drag & drop your CDX or CDXML file";

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
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

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    onExtract(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

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

  return (
    <div>
      <input
        type="file"
        accept=".cdx,.cdxml"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileInputChange}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload CDX or CDXML file"
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
        <p className="text-body font-semibold text-foreground">{headlineText}</p>
        {!isDragOver && (
          <p className="text-body text-muted-foreground">or click to browse</p>
        )}
        <p className="text-caption text-muted-foreground">
          Supports .cdx and .cdxml — up to 50 MB
        </p>
        <Button
          variant="default"
          size="lg"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          Extract structures
        </Button>
      </div>
    </div>
  );
}
