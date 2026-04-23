/**
 * AboutPage — Phase 3 Liquid Glass rebuild (Task 13).
 *
 * Bento editorial layout (route: `/about`). Three columns at `lg:`,
 * five tiles in total:
 *
 *   ┌─────────────────────────┬──────────┐
 *   │  Hero: mission + CTAs   │  Version │
 *   │  (2×2, display type)    │  (1×1)   │
 *   │                         ├──────────┤
 *   │                         │  Links   │
 *   │                         │  (1×1)   │
 *   ├─────────┬───────────────┴──────────┤
 *   │ Tech    │  Credits / upstream      │
 *   │ stack   │  (2×1)                   │
 *   │ (1×1)   │                          │
 *   └─────────┴──────────────────────────┘
 *
 * The page is pure static content — no data fetching, no props. Every
 * tile carries a stable `data-slot` hook so selectors / tests can anchor
 * without depending on class names.
 */
import type { ReactNode } from "react";
import {
  ArrowUpRightIcon,
  AtomIcon,
  ExternalLinkIcon,
  FlaskConicalIcon,
  BookOpenIcon,
} from "lucide-react";

import { BentoCell } from "@/components/layout/BentoCell";
import { BentoGrid } from "@/components/layout/BentoGrid";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/Link";

// TODO: replace with a build-time define from vite.config / package.json
// so releases stamp the correct version automatically.
const VERSION = "1.0";
const BUILD_LABEL = "April 2026";

interface TechEntry {
  label: string;
  detail: string;
}

const TECH_STACK: TechEntry[] = [
  { label: "React 19", detail: "SPA + TypeScript" },
  { label: "Tailwind v4", detail: "Design tokens" },
  { label: "Vite", detail: "Build + dev server" },
  { label: "FastAPI", detail: "Python 3.11 API" },
  { label: "JPype", detail: "Python ↔ JVM" },
  { label: "CDK 2.12", detail: "Descriptor engine" },
];

interface LinkEntry {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
}

const LINKS: LinkEntry[] = [
  {
    href: "https://github.com/Beilstein-Institut/BChemXtract",
    label: "BChemXtract on GitHub",
    description: "Upstream Java library + issue tracker.",
    icon: <BookOpenIcon />,
  },
  {
    href: "https://pubchem.ncbi.nlm.nih.gov/",
    label: "PubChem",
    description: "Lookup compounds by InChI / SMILES.",
    icon: <FlaskConicalIcon />,
  },
  {
    href: "https://www.rdkit.org/",
    label: "RDKit",
    description: "Complementary open cheminformatics.",
    icon: <AtomIcon />,
  },
];

export function AboutPage() {
  return (
    <PageContainer data-slot="about-page">
      <header className="space-y-2">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          About
        </h1>
        <p className="text-base text-foreground-muted">
          A browser wrapper around the BChemXtract Java library — built at
          the Beilstein-Institut to make ChemDraw extraction accessible to
          anyone.
        </p>
      </header>

      <BentoGrid
        cols={3}
        className="mt-8 auto-rows-[minmax(180px,auto)]"
        data-slot="about-bento"
      >
        <BentoCell span="2:2" data-slot="about-hero-cell">
          <HeroTile />
        </BentoCell>
        <BentoCell span="1:1" data-slot="about-version-cell">
          <VersionTile />
        </BentoCell>
        <BentoCell span="1:1" data-slot="about-links-cell">
          <LinksTile />
        </BentoCell>
        <BentoCell span="1:1" data-slot="about-tech-cell">
          <TechStackTile />
        </BentoCell>
        <BentoCell span="2:1" data-slot="about-credits-cell">
          <CreditsTile />
        </BentoCell>
      </BentoGrid>
    </PageContainer>
  );
}

function HeroTile() {
  return (
    <article
      data-slot="about-hero"
      className="flex h-full flex-col justify-between gap-8 rounded-lg border border-border bg-surface p-8"
    >
      <div className="space-y-5">
        <Badge variant="secondary" className="font-mono uppercase tracking-wider">
          Chemistry · Extraction
        </Badge>
        <h2 className="font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05] tracking-tight text-foreground">
          ChemDraw, decoded for{" "}
          <span className="text-primary">anyone</span>.
        </h2>
        <p className="max-w-[52ch] text-base leading-relaxed text-foreground-muted">
          BChemXtractWeb parses CDX and CDXML files, extracts structures
          and reactions, and enriches them with computed descriptors —
          InChI, SMILES, RInChI, molecular formulas — all without
          installing Java or touching a command line. Drop a file, read
          the structures back as JSON, SDF, or CSV.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className={buttonVariants({ size: "lg" })}>
          Start extracting
        </Link>
        <a
          href="https://github.com/Beilstein-Institut/BChemXtract"
          target="_blank"
          rel="noreferrer"
          className={
            buttonVariants({ variant: "outline", size: "lg" }) + " gap-2"
          }
        >
          View on GitHub
          <ArrowUpRightIcon className="size-4" />
        </a>
      </div>
    </article>
  );
}

function VersionTile() {
  return (
    <article
      data-slot="about-version"
      className="flex h-full flex-col justify-center gap-2 rounded-lg border border-border bg-surface p-6"
    >
      <span className="text-caption font-semibold uppercase tracking-wide text-foreground-muted">
        Version
      </span>
      <span
        data-slot="about-version-value"
        className="font-display text-5xl font-semibold leading-none text-primary tabular-nums"
      >
        {VERSION}
      </span>
      <span className="text-caption text-foreground-muted">
        {BUILD_LABEL}
      </span>
    </article>
  );
}

function LinksTile() {
  return (
    <article
      data-slot="about-links"
      className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-6"
    >
      <span className="text-caption font-semibold uppercase tracking-wide text-foreground-muted">
        Resources
      </span>
      <ul className="flex flex-col gap-2" data-slot="about-links-list">
        {LINKS.map(({ href, label, description, icon }) => (
          <li key={href}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="group/link flex items-start gap-3 rounded-md p-2 -mx-2 transition-colors hover:bg-accent"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-foreground-muted [&_svg]:size-4 group-hover/link:text-primary"
              >
                {icon}
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground group-hover/link:text-primary">
                  {label}
                </span>
                <span className="text-caption text-foreground-muted">
                  {description}
                </span>
              </span>
              <ExternalLinkIcon
                aria-hidden="true"
                className="mt-1 size-3.5 shrink-0 text-foreground-muted group-hover/link:text-primary"
              />
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}

function TechStackTile() {
  return (
    <article
      data-slot="about-tech-stack"
      className="flex h-full flex-col gap-4 rounded-lg border border-border bg-surface p-6"
    >
      <div className="flex flex-col gap-1">
        <span className="text-caption font-semibold uppercase tracking-wide text-foreground-muted">
          Tech stack
        </span>
        <span className="text-caption text-foreground-muted">
          Simplest tool at every layer.
        </span>
      </div>
      <ul className="flex flex-wrap gap-2" data-slot="about-tech-list">
        {TECH_STACK.map(({ label, detail }) => (
          <li key={label}>
            <Badge
              variant="outline"
              className="font-mono text-[0.7rem]"
              title={detail}
            >
              {label}
            </Badge>
          </li>
        ))}
      </ul>
    </article>
  );
}

function CreditsTile() {
  return (
    <article
      data-slot="about-credits"
      className="flex h-full flex-col gap-4 rounded-lg border border-border bg-surface p-6"
    >
      <span className="text-caption font-semibold uppercase tracking-wide text-foreground-muted">
        Credits
      </span>
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-foreground">
          BChemXtractWeb wraps the{" "}
          <a
            href="https://github.com/Beilstein-Institut/BChemXtract"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            BChemXtract
          </a>{" "}
          Java library developed at the{" "}
          <a
            href="https://www.beilstein-institut.de/"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            Beilstein-Institut
          </a>
          , an independent non-profit foundation advancing the chemical
          sciences.
        </p>
        <p className="text-caption text-foreground-muted">
          Built with CDK 2.12 for descriptors, FastAPI + JPype to bridge
          Python and the JVM, and React 19 for the interface.
          Contributions, feedback, and issue reports welcome upstream.
        </p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <a
          href="https://github.com/Beilstein-Institut/BChemXtract"
          target="_blank"
          rel="noreferrer"
          className={
            buttonVariants({ variant: "outline", size: "sm" }) + " gap-1.5"
          }
        >
          BChemXtract repo
          <ArrowUpRightIcon className="size-3.5" />
        </a>
        <a
          href="https://www.beilstein-institut.de/"
          target="_blank"
          rel="noreferrer"
          className={
            buttonVariants({ variant: "ghost", size: "sm" }) + " gap-1.5"
          }
        >
          Beilstein-Institut
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>
    </article>
  );
}
