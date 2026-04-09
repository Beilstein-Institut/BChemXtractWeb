import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="bchemxtract-theme">
      <div className="min-h-screen bg-background text-foreground">
        <header className="flex items-center justify-end p-4">
          <ModeToggle />
        </header>
        <main className="mx-auto max-w-[980px] px-4 py-16">
          <h1 className="text-heading font-semibold">BChemXtractWeb</h1>
          <p className="mt-4 text-body text-muted-foreground">
            Chemical structure extraction from ChemDraw files.
          </p>
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
