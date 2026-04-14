import { useState, useEffect } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { Toaster, toast } from "sonner";
import { useExtract } from "@/hooks/useExtract";
import { FileUpload } from "@/components/FileUpload";
import { ExtractionSummary } from "@/components/ExtractionSummary";
import { StructureGrid } from "@/components/StructureGrid";

function App() {
  const { state, result, errorMessage, extract, reset } = useExtract();

  // Show a toast whenever extraction enters the error state (WR-04).
  useEffect(() => {
    if (state === "error" && errorMessage) {
      toast.error(errorMessage);
    }
  }, [state, errorMessage]);

  /**
   * Track the selected file so we can show filename and size in the
   * loading message. Cleared when the user resets to idle.
   *
   * Note: the JVM singleton constraint means extraction is stateless per
   * request — one active extraction at a time.
   */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleExtract(file: File) {
    setSelectedFile(file);
    extract(file);
  }

  function handleReset() {
    setSelectedFile(null);
    reset();
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="bchemxtract-theme">
      <div className="min-h-screen bg-background text-foreground">
        <header className="flex items-center justify-end p-4">
          <ModeToggle />
        </header>

        <main className="mx-auto max-w-[980px] px-4 pt-16 pb-16">
          <h1 className="text-heading font-semibold">BChemXtractWeb</h1>
          <p className="mt-4 text-body text-muted-foreground">
            Extract chemical structures from ChemDraw files.
          </p>

          {/* Idle or Error state: show upload drop zone */}
          {(state === "idle" || state === "error") && (
            <div className="mt-12">
              <FileUpload
                onExtract={handleExtract}
                isLoading={false}
              />
            </div>
          )}

          {/* Loading state: FileUpload handles spinner internally */}
          {state === "loading" && (
            <div className="mt-12">
              <FileUpload
                onExtract={handleExtract}
                isLoading={true}
                loadingFilename={selectedFile?.name}
                loadingFileSize={selectedFile?.size}
              />
            </div>
          )}

          {/* Success state: show summary + grid */}
          {state === "success" && result !== null && (
            <>
              <div className="mt-8">
                <ExtractionSummary response={result} onReset={handleReset} />
              </div>
              <div className="mt-8">
                <StructureGrid response={result} onReset={handleReset} />
              </div>
            </>
          )}
        </main>
      </div>
      <Toaster richColors />
    </ThemeProvider>
  );
}

export default App;
