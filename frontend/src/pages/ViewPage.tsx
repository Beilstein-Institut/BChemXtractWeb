/**
 * ViewPage — drop a ChemDraw file, see it rendered exactly as drawn, download
 * it as SVG/PNG. Nothing is stored: the file is rendered in-memory server-side
 * (POST /api/render.svg, Cache-Control: no-store) and never persisted. The
 * "nothing stored" notice stays visible in both the drop and viewer states.
 *
 * Self-contained: its own file→SVG lifecycle, no props. The rendered SVG is
 * handed to <CdxViewer>, which already provides zoom/pan + the SVG/PNG
 * download menu.
 */
import { useRef, useState } from "react";
import { RotateCcwIcon, ShieldCheckIcon, UploadCloudIcon } from "lucide-react";
import { toast } from "sonner";
import { CdxViewer } from "@/components/CdxViewer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { postRenderUpload } from "@/lib/apiClient";
import { cn } from "@/lib/utils";

// Matches the backend cap and the Extract page's drop-zone validation.
const MAX_FILE_BYTES = 52_428_800; // 50 MB

function validate(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".cdx") && !name.endsWith(".cdxml")) {
    return "File type not supported. Drop a .cdx or .cdxml file.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "File exceeds 50 MB. Split or compress before uploading.";
  }
  return null;
}

/** Persistent, deliberately visible reassurance that nothing is stored. */
function PrivacyNotice() {
  return (
    <p
      data-slot="view-privacy-notice"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted/60 px-3 py-1.5 text-sm text-foreground-muted"
    >
      <ShieldCheckIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
      Nothing is stored — your file is rendered in memory and never saved.
    </p>
  );
}

export function ViewPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [title, setTitle] = useState("ChemDraw file");
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  async function handleFile(file: File) {
    const error = validate(file);
    if (error) {
      toast.error(error);
      return;
    }
    setTitle(file.name.replace(/\.(cdx|cdxml)$/i, ""));
    setLoading(true);
    try {
      setSvg(await postRenderUpload(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not render the file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer>
      <header className="mb-8 space-y-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          View as drawn.
        </h1>
        <p className="max-w-[60ch] text-base text-foreground-muted">
          Drop a CDX or CDXML file to see it rendered exactly as drawn, then download it as SVG or
          PNG.
        </p>
        <PrivacyNotice />
      </header>

      {svg && (
        <div className="h-[70vh] animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none">
          <CdxViewer
            svg={svg}
            title={title}
            actions={
              <Button variant="outline" size="sm" onClick={() => setSvg(null)}>
                <RotateCcwIcon
                  className="size-4 transition-transform duration-300 ease-out motion-safe:group-hover/button:-rotate-180"
                  aria-hidden="true"
                />
                View another file
              </Button>
            }
          />
        </div>
      )}

      {!svg && loading && (
        <div className="flex flex-col items-center gap-4 py-24">
          <Spinner className="size-12 text-primary" />
          <p aria-live="polite" className="text-base text-foreground-muted">
            Rendering {title}…
          </p>
        </div>
      )}

      {!svg && !loading && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".cdx,.cdxml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <div
            data-slot="view-drop-zone"
            data-state={isDragOver ? "drag-over" : "idle"}
            role="button"
            tabIndex={0}
            aria-label="Upload a CDX or CDXML file to view"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className={cn(
              "flex min-h-[280px] w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isDragOver
                ? "border-primary bg-accent/30"
                : "border-border bg-surface-elevated hover:border-primary/40",
            )}
          >
            <UploadCloudIcon className="size-12 text-foreground-muted" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-base font-medium text-foreground">Drop a CDX or CDXML file</p>
              <p className="text-sm text-foreground-muted">or click to browse — up to 50 MB</p>
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}
