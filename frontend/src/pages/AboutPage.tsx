/**
 * AboutPage — editorial "who made this and why" page (route: `/about`).
 *
 * Styled as a scientific-publication page: numbered sections, pull quote,
 * stroke-drawn molecular hero SVG, Geist Mono for technical accents,
 * staggered reveal on load. Extends the Apple-inspired palette already
 * in use across the app (Apple Blue accent, OKLCH neutrals) rather than
 * introducing a competing system.
 */
import { ArrowUpRightIcon, ZapIcon, FileSearchIcon, DownloadIcon } from "lucide-react";
import { Link } from "@/lib/Link";
import { buttonVariants } from "@/components/ui/button";

const STACK: Array<{ label: string; detail: string }> = [
  { label: "Frontend", detail: "React 19 · TypeScript · Vite · Tailwind v4" },
  { label: "Backend", detail: "FastAPI · Python 3.11 · PostgreSQL" },
  { label: "Bridge", detail: "JPype · JVM 17 · JNI" },
  { label: "Core engine", detail: "BChemXtract · CDK 2.12 · Java" },
];

const STEPS: Array<{ icon: typeof ZapIcon; title: string; body: string }> = [
  {
    icon: ZapIcon,
    title: "Upload",
    body: "Drop a .cdx or .cdxml file. We auto-detect the format via its magic bytes and route to the correct reader.",
  },
  {
    icon: FileSearchIcon,
    title: "Extract",
    body: "BChemXtract walks the ChemDraw document, deduplicates fragments, and computes InChI, SMILES, and molecular formulae through CDK.",
  },
  {
    icon: DownloadIcon,
    title: "Browse & export",
    body: "Inspect structures in a paginated grid, reopen past extractions from history, and export everything as SDF, CSV, or JSON.",
  },
];

export function AboutPage() {
  return (
    <>
      {/* Scoped styles — load-in animations + Geist display. Keeps the About
          page's editorial flavor without polluting global CSS. */}
      <style>{`
        @keyframes about-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes about-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes about-draw {
          from { stroke-dashoffset: 800; }
          to   { stroke-dashoffset: 0; }
        }
        .about-rise {
          opacity: 0;
          animation: about-rise 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }
        .about-fade {
          opacity: 0;
          animation: about-fade 0.9s ease forwards;
        }
        .about-molecule path,
        .about-molecule line,
        .about-molecule polyline,
        .about-molecule polygon {
          stroke-dasharray: 800;
          stroke-dashoffset: 800;
          animation: about-draw 1.8s cubic-bezier(0.5, 0, 0.2, 1) 0.2s forwards;
        }
        .about-molecule text {
          opacity: 0;
          animation: about-fade 0.6s ease 1.5s forwards;
        }
        .about-num {
          font-family: "Geist Variable", "Geist", var(--font-sans);
          font-feature-settings: "tnum" on, "cv11" on;
          font-variant-numeric: tabular-nums;
        }
        .about-display {
          font-family: "Geist Variable", "Geist", var(--font-sans);
          letter-spacing: -0.035em;
        }
        .about-mono {
          font-family: "Geist Mono Variable", "Geist Mono", ui-monospace,
            SFMono-Regular, "SF Mono", Menlo, monospace;
        }
        .about-grid {
          background-image:
            linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px);
          background-size: 120px 100%;
        }
        .dark .about-grid {
          background-image:
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px);
        }
      `}</style>

      {/* Hero — editorial slab with section marker, large display title, and
          stroke-drawn molecular diagram on the right. */}
      <section className="relative grid grid-cols-1 gap-10 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:pt-16">
        <div>
          <div
            className="about-rise about-mono mb-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
            style={{ animationDelay: "0ms" }}
          >
            <span>Beilstein-Institut</span>
            <span aria-hidden className="h-px w-8 bg-current opacity-40" />
            <span>2026 · v1.0</span>
          </div>

          <h1
            className="about-rise about-display text-[clamp(44px,7vw,80px)] font-semibold leading-[0.95] text-foreground"
            style={{ animationDelay: "80ms" }}
          >
            ChemDraw,
            <br />
            <span className="text-[color:var(--color-link)] dark:text-[color:var(--color-link-dark)]">
              decoded
            </span>{" "}
            for anyone.
          </h1>

          <p
            className="about-rise mt-8 max-w-[42ch] text-sub-heading text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            BChemXtractWeb is a browser-based wrapper around{" "}
            <a
              href="https://github.com/Beilstein-Institut/BChemXtract"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-[color:var(--color-link)]/50 underline-offset-4 hover:decoration-[color:var(--color-link)]"
            >
              BChemXtract
            </a>{" "}
            — an open-source Java library for extracting chemical
            structures and reactions from ChemDraw files. No Java. No
            CLI. No tooling. Just drop and go.
          </p>

          <div
            className="about-rise mt-10 flex flex-wrap gap-3"
            style={{ animationDelay: "240ms" }}
          >
            <Link to="/" className={buttonVariants({ size: "lg" })}>
              Start extracting
            </Link>
            <a
              href="https://github.com/Beilstein-Institut/BChemXtract"
              target="_blank"
              rel="noopener noreferrer"
              className={
                buttonVariants({ variant: "outline", size: "lg" }) + " gap-2"
              }
            >
              View on GitHub
              <ArrowUpRightIcon className="size-4" />
            </a>
          </div>
        </div>

        {/* Stroke-drawn molecule — a stylised para-substituted benzene with
            reaction arrow. Animates stroke-dashoffset on mount. */}
        <div className="about-fade relative" style={{ animationDelay: "120ms" }}>
          <div className="about-grid absolute inset-0 -z-10" aria-hidden />
          <svg
            viewBox="0 0 380 320"
            className="about-molecule h-auto w-full max-w-[460px] text-foreground"
            role="img"
            aria-label="Stylized chemical reaction: benzene ring transformed via extraction"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            {/* Left benzene ring */}
            <polygon
              points="60,120 100,96 140,120 140,168 100,192 60,168"
              opacity="0.95"
            />
            {/* Inner double bonds — Kekule representation */}
            <line x1="72" y1="126" x2="72" y2="162" opacity="0.7" />
            <line x1="108" y1="104" x2="132" y2="118" opacity="0.7" />
            <line x1="108" y1="184" x2="132" y2="170" opacity="0.7" />
            {/* Substituent stem */}
            <line x1="140" y1="120" x2="176" y2="100" />
            <text
              x="184"
              y="100"
              fontSize="13"
              fontFamily="Geist Mono Variable, ui-monospace, monospace"
              fill="currentColor"
              stroke="none"
              dominantBaseline="middle"
            >
              OH
            </text>

            {/* Reaction arrow */}
            <line x1="208" y1="150" x2="272" y2="150" />
            <polyline points="262,144 272,150 262,156" />
            <text
              x="240"
              y="138"
              fontSize="10"
              textAnchor="middle"
              fontFamily="Geist Mono Variable, ui-monospace, monospace"
              fill="currentColor"
              stroke="none"
              letterSpacing="0.1em"
            >
              EXTRACT
            </text>

            {/* Right "data" lattice — abstract InChI/SMILES columns */}
            <g transform="translate(288, 60)">
              <line x1="0" y1="0" x2="0" y2="200" opacity="0.35" />
              <line x1="20" y1="0" x2="20" y2="200" opacity="0.35" />
              <line x1="40" y1="0" x2="40" y2="200" opacity="0.35" />
              <line x1="60" y1="0" x2="60" y2="200" opacity="0.35" />
              <line x1="80" y1="0" x2="80" y2="200" opacity="0.35" />
              {/* Data "hits" */}
              <line x1="0" y1="30" x2="80" y2="30" strokeWidth="2" />
              <line x1="0" y1="64" x2="60" y2="64" strokeWidth="2" />
              <line x1="0" y1="98" x2="80" y2="98" strokeWidth="2" />
              <line x1="0" y1="132" x2="40" y2="132" strokeWidth="2" />
              <line x1="0" y1="166" x2="80" y2="166" strokeWidth="2" />
            </g>

            {/* Annotation dots */}
            <circle cx="60" cy="120" r="2.5" fill="currentColor" />
            <circle cx="140" cy="120" r="2.5" fill="currentColor" />
            <circle cx="100" cy="192" r="2.5" fill="currentColor" />
          </svg>
          <div className="about-mono mt-4 flex items-center justify-end gap-2 pr-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>Fig. 1</span>
            <span aria-hidden className="h-px w-6 bg-current opacity-40" />
            <span>CDX → InChI / SMILES / RInChI</span>
          </div>
        </div>
      </section>

      {/* Hairline divider */}
      <hr className="mt-20 border-t border-border" />

      {/* §01 Mission */}
      <Section num="01" title="The mission">
        <p className="text-body text-foreground leading-[1.65] max-w-[62ch]">
          Chemists routinely sit on years of ChemDraw files — the raw
          sketches behind papers, patents, lab notebooks. The structures
          inside are valuable, but trapped in a proprietary format that
          needs specialist tooling to open, let alone query.
        </p>
        <p className="mt-5 text-body text-foreground leading-[1.65] max-w-[62ch]">
          <strong className="font-semibold">BChemXtract</strong> changed
          that by making parsing open-source. <strong className="font-semibold">BChemXtractWeb</strong>{" "}
          removes the last barrier: you no longer need Java, a terminal,
          or a build system. Any browser is enough.
        </p>

        {/* Pull quote */}
        <blockquote className="relative mt-12 border-l-2 border-[color:var(--color-link)] pl-6 md:pl-8">
          <p className="about-display text-[clamp(22px,3vw,32px)] font-medium leading-[1.25] text-foreground">
            “Any user — technical or not — can extract, browse, search,
            and export chemical structures from ChemDraw files without
            installing Java or using a command line.”
          </p>
          <footer className="about-mono mt-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            — Project charter
          </footer>
        </blockquote>
      </Section>

      {/* §02 How it works */}
      <Section num="02" title="How it works">
        <div className="mt-2 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <article key={s.title} className="relative">
                <span className="about-num block text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Step {String(i + 1).padStart(2, "0")}
                </span>
                <div className="mt-4 flex size-10 items-center justify-center rounded-full border border-border bg-card">
                  <Icon className="size-4 text-foreground" />
                </div>
                <h3 className="about-display mt-5 text-heading font-semibold text-foreground">
                  {s.title}
                </h3>
                <p className="mt-3 text-body leading-[1.55] text-muted-foreground">
                  {s.body}
                </p>
              </article>
            );
          })}
        </div>
      </Section>

      {/* §03 The stack */}
      <Section num="03" title="Under the hood">
        <p className="text-body text-foreground leading-[1.65] max-w-[62ch]">
          A single long-lived JVM, bridged into Python via JPype, sits
          behind a FastAPI service. A React SPA talks to it over JSON.
          Each layer picks the simplest tool that does its job well.
        </p>
        <dl className="mt-10 divide-y divide-border border-y border-border">
          {STACK.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[120px_1fr] items-baseline gap-6 py-5 md:grid-cols-[200px_1fr]"
            >
              <dt className="about-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-body text-foreground">{row.detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* §04 Credits */}
      <Section num="04" title="Credits">
        <p className="text-body text-foreground leading-[1.65] max-w-[62ch]">
          BChemXtract is developed at the{" "}
          <a
            href="https://www.beilstein-institut.de/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline decoration-[color:var(--color-link)]/50 underline-offset-4 hover:decoration-[color:var(--color-link)]"
          >
            Beilstein-Institut
          </a>
          , an independent non-profit foundation advancing the chemical
          sciences. The web wrapper is open work — contributions,
          feedback, and issue reports welcome.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="https://github.com/Beilstein-Institut/BChemXtract"
            target="_blank"
            rel="noopener noreferrer"
            className={
              buttonVariants({ variant: "outline", size: "lg" }) + " gap-2"
            }
          >
            BChemXtract repository
            <ArrowUpRightIcon className="size-4" />
          </a>
          <a
            href="https://www.beilstein-institut.de/"
            target="_blank"
            rel="noopener noreferrer"
            className={
              buttonVariants({ variant: "outline", size: "lg" }) + " gap-2"
            }
          >
            Beilstein-Institut
            <ArrowUpRightIcon className="size-4" />
          </a>
        </div>
      </Section>

      <footer className="mt-24 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 pb-4 sm:flex-row sm:items-center">
        <p className="about-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          © 2026 · Beilstein-Institut · BChemXtractWeb v1.0
        </p>
        <Link
          to="/"
          className="text-[14px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to Extract →
        </Link>
      </footer>
    </>
  );
}

interface SectionProps {
  num: string;
  title: string;
  children: React.ReactNode;
}

function Section({ num, title, children }: SectionProps) {
  return (
    <section className="mt-20 grid grid-cols-1 gap-8 lg:grid-cols-[180px_1fr] lg:gap-12">
      <header className="lg:sticky lg:top-20 lg:self-start">
        <div className="about-num text-[40px] font-semibold leading-none text-muted-foreground/60">
          {num}
        </div>
        <div className="about-mono mt-3 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          §{num}
        </div>
        <h2 className="about-display mt-4 text-heading font-semibold tracking-tight text-foreground">
          {title}
        </h2>
      </header>
      <div>{children}</div>
    </section>
  );
}
