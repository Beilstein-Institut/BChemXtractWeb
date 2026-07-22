/**
 * HomePage — the landing route ("/").
 *
 * A single-screen hero: header, this content, and the footer all fit without
 * scrolling. Its one visual is the product's own thesis — a real 2D structure
 * "read back" into machine-readable identifiers. The structure is a genuine
 * RDKit depiction (src/assets/aspirin.svg) on a white sub-surface, exactly how
 * the app renders every structure. No upload surface (that lives on /extract),
 * no wall of tiles (that lives on /about).
 *
 * Kept deliberately compact: App trims the main padding on this route, and the
 * spacing here stays tight so nothing pushes the footer below the fold.
 */
import { ArrowRightIcon } from "lucide-react";
import aspirinStructure from "@/assets/aspirin.svg";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/PageContainer";
import { navigate } from "@/lib/router";

export function HomePage() {
  return (
    <PageContainer className="py-0">
      <section
        data-slot="home-hero"
        className="relative flex flex-col items-center text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500"
      >
        {/* soft crimson light, lifting the composition off the board */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50% 44% at 50% 34%, color-mix(in oklch, var(--color-primary) 8%, transparent), transparent 72%)",
          }}
        />

        <h1 className="font-display text-4xl font-bold tracking-tight text-balance text-foreground sm:text-5xl">
          ChemDraw, <span className="text-foreground-muted">read back.</span>
        </h1>
        <p className="mt-2.5 max-w-[60ch] text-sm leading-snug text-foreground-muted sm:text-base">
          Parse ChemDraw CDX and CDXML files in the browser. Every structure and reaction comes back
          with InChI, SMILES, RInChI, and molecular formulas, ready to export as JSON, SDF, or TSV.
          No Java, no command line.
        </p>

        {/* The one visual: a real structure resolving into its identifiers. */}
        <div className="mt-4 flex w-full max-w-xl flex-col items-stretch gap-3 rounded-2xl bg-surface p-3.5 shadow-[var(--shadow-neu-raised)] sm:flex-row sm:items-center sm:p-4">
          <figure className="m-0 flex flex-1 flex-col items-center gap-2">
            <div className="w-full max-w-[140px] rounded-xl bg-white p-2.5 shadow-[var(--shadow-neu-inset)]">
              <img
                src={aspirinStructure}
                alt="2D structure of aspirin"
                className="mx-auto h-auto w-full"
                width={360}
                height={260}
                draggable={false}
              />
            </div>
            <figcaption className="text-[0.7rem] tracking-wide text-foreground-muted">
              Aspirin
            </figcaption>
          </figure>

          <ArrowRightIcon
            aria-hidden
            className="mx-auto size-4 flex-none rotate-90 text-primary sm:rotate-0"
          />

          <dl className="flex-1 space-y-2 text-left text-[0.78rem]">
            <div>
              <dt className="text-foreground-muted">SMILES</dt>
              <dd className="text-foreground">CC(=O)Oc1ccccc1C(=O)O</dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Formula</dt>
              <dd className="text-foreground">
                C<sub>9</sub>H<sub>8</sub>O<sub>4</sub>
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">InChIKey</dt>
              <dd className="break-all text-foreground">BSYNRYMUTXBXSQ-UHFFFAOYSA-N</dd>
            </div>
          </dl>
        </div>

        <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Button size="lg" onClick={() => navigate("/extract")}>
            Start extracting
          </Button>
          <Button size="lg" variant="ghost" onClick={() => navigate("/browse")}>
            Browse the library
          </Button>
        </div>
      </section>
    </PageContainer>
  );
}
