/**
 * LimitationsPage — honest account of what extraction does and does not do.
 *
 * Content mirrors the upstream BChemXtract LIMITATIONS document, with two
 * entries rewritten because they describe the bare Java library rather than
 * this web app:
 *
 *   - "Large structures": upstream caps at 500 atoms; this app skips InChI
 *     above 100 heavy atoms (backend/app/services/extractor.py) because InChI
 *     generation blows up super-linearly, so our lower guard is the one users
 *     actually hit.
 *   - "Untrusted input": upstream does not disable external entities; this app
 *     screens the CDXML prolog and rejects DOCTYPE/ENTITY payloads with a 415
 *     before the bytes reach the Java reader (backend/app/services/xml_guard.py).
 *
 * Pure static content — no props, no fetching. The "at a glance" table doubles
 * as the table of contents (each row number anchors to its detail section), so
 * there is deliberately no separate TOC nav.
 */
import { ArrowUpRightIcon, TriangleAlertIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/Link";
import { cn } from "@/lib/utils";
import { LEGAL_LINK_CLASS, LegalPageHeader } from "@/pages/legalShared";

const UPSTREAM_ISSUES_URL = "https://github.com/Beilstein-Institut/BChemXtract/issues/new/choose";
const OPEN_SOURCE_EMAIL = "open-source@beilstein-institut.de";

type Severity = "High" | "Medium-High" | "Medium" | "Low-Medium" | "Low";

/**
 * Severity chips reuse existing Badge variants rather than introducing colour
 * tokens. Visual weight descends: crimson default → amber warning → filled
 * secondary → hairline outline.
 */
const SEVERITY_VARIANT: Record<Severity, "default" | "warning" | "secondary" | "outline"> = {
  High: "default",
  "Medium-High": "warning",
  Medium: "secondary",
  "Low-Medium": "outline",
  Low: "outline",
};

interface GlanceRow {
  /** Anchor id of the matching Details section. */
  id: string;
  area: string;
  limitation: string;
  severity: Severity;
}

const GLANCE: GlanceRow[] = [
  {
    id: "reactions",
    area: "Reactions",
    limitation: "Experimental; arrow-alignment heuristics, sanitize off by default",
    severity: "High",
  },
  {
    id: "cdxml-fidelity",
    area: "CDXML fidelity",
    limitation: "Arrow, BioShape, LinkNode, ColoredMolecularAreas silently dropped",
    severity: "Medium-High",
  },
  {
    id: "large-structures",
    area: "Large structures",
    limitation: "Above 100 heavy atoms → no InChI/InChIKey, and no PubChem enrichment",
    severity: "Medium",
  },
  {
    id: "stereo",
    area: "Stereo",
    limitation: "Wavy-bond E/Z: SMILES vs InChI/MDL descriptors can disagree",
    severity: "Medium",
  },
  {
    id: "markush",
    area: "Markush",
    limitation: "Alt-group path thinly validated; multi-atom substituents can fail",
    severity: "Medium",
  },
  {
    id: "untrusted-input",
    area: "Untrusted input",
    limitation: "DOCTYPE/ENTITY screened at upload; the Java parser itself is unhardened",
    severity: "Low",
  },
  {
    id: "configurability",
    area: "Configurability",
    limitation: "Safety limits and reader strictness are hardcoded",
    severity: "Low-Medium",
  },
  {
    id: "test-coverage",
    area: "Test coverage",
    limitation: "No unit tests for several correctness-critical chemistry handlers",
    severity: "Medium",
  },
];

interface Detail {
  id: string;
  title: string;
  body: React.ReactNode;
}

const BULLETS_CLASS = "ml-5 list-disc space-y-1.5 marker:text-foreground-muted";

const DETAILS: Detail[] = [
  {
    id: "reactions",
    title: "1. Reaction extraction is experimental",
    body: (
      <p>
        Reaction extraction is under active development and should be treated as a preview, not a
        supported feature. <code>ReactionXtractor</code> defaults to <code>sanitize = false</code>,
        and correct grouping of reactants / products / agents depends on{" "}
        <strong className="font-semibold text-foreground">arrow-alignment heuristics</strong>.
        RInChI and reaction SMILES are produced, but reaction output should not be trusted
        unsupervised.
      </p>
    ),
  },
  {
    id: "cdxml-fidelity",
    title: "2. Silent data loss on several CDXML constructs",
    body: (
      <>
        <p>
          Several CDX/CDXML constructs are dropped during read or write{" "}
          <strong className="font-semibold text-foreground">without surfacing to the caller</strong>{" "}
          — the riskiest kind of gap, because it is invisible unless you diff against the source:
        </p>
        <ul className={BULLETS_CLASS}>
          <li>
            <code>Arrow</code> and <code>BioShape</code> elements are discarded on read
          </li>
          <li>
            <code>LinkNode</code> maps to <code>null</code>
          </li>
          <li>
            <code>ColoredMolecularAreas</code> are not written back out (round-trip loss)
          </li>
          <li>
            <code>CDArrow.dipole</code> is unimplemented
          </li>
          <li>Arrowhead-type constants are marked unverified upstream</li>
        </ul>
        <p>
          BChemXtract is a{" "}
          <strong className="font-semibold text-foreground">
            chemistry extractor, not a faithful CDX round-trip tool
          </strong>{" "}
          — drawing-level (non-chemistry) content is not a first-class citizen.
        </p>
      </>
    ),
  },
  {
    id: "large-structures",
    title: "3. Hard safety limits on large structures",
    body: (
      <>
        <p>
          This app applies its own limit, lower than the library's: InChI, InChIKey, and AuxInfo are{" "}
          <strong className="font-semibold text-foreground">
            skipped for molecules above 100 heavy (non-hydrogen) atoms
          </strong>
          . InChI generation blows up super-linearly on large, highly symmetric structures — a
          162-heavy-atom supramolecular cage takes about five minutes, while ordinary molecules
          finish in well under a second. Where the molecular formula cannot be parsed, the same skip
          applies to SMILES longer than 1500 characters.
        </p>
        <p>Consequences for those structures:</p>
        <ul className={BULLETS_CLASS}>
          <li>
            InChI and InChIKey come back{" "}
            <strong className="font-semibold text-foreground">empty</strong>, and the structure is
            de-duplicated by a hash of its SMILES instead.
          </li>
          <li>
            PubChem enrichment is unavailable — lookups are keyed on a well-formed InChIKey, so a
            structure without one cannot be resolved.
          </li>
          <li>AuxInfo longer than 4000 characters is silently dropped.</li>
        </ul>
        <p>
          Large peptides, polymers, and big natural products therefore come back InChI-less. The
          library enforces a further 500-atom cap of its own underneath, but this app's guard is the
          one you will hit first. Neither limit is configurable at runtime.
        </p>
      </>
    ),
  },
  {
    id: "stereo",
    title: "4. Stereochemistry edge cases",
    body: (
      <>
        <p>
          Tetrahedral stereo loss on the MDL V3000 round-trip has been fixed. One open, deliberately{" "}
          <strong className="font-semibold text-foreground">undecided</strong> case remains:
        </p>
        <ul className={BULLETS_CLASS}>
          <li>
            <strong className="font-semibold text-foreground">
              Double bonds drawn with a wavy substituent
            </strong>{" "}
            mean "E/Z deliberately unspecified" in ChemDraw. SMILES honors the wavy and omits E/Z,
            but the InChI and MDL→InChI paths assign E/Z from the 2D coordinates. As a result, the
            three descriptors for the <em>same molecule</em> can legitimately disagree. This is a
            pending chemistry-intent decision, not yet a code fix.
          </li>
        </ul>
        <p>
          Related: when a stereocentre is left undetermined, InChI falls back to raw 2D coordinates
          for that centre — so{" "}
          <strong className="font-semibold text-foreground">
            coordinates are not always cosmetic
          </strong>{" "}
          and can change the InChIKey.
        </p>
      </>
    ),
  },
  {
    id: "markush",
    title: "5. Markush / R-group support has soft edges",
    body: (
      <>
        <p>R-group enumeration is opt-in and combinatorial. Known gaps:</p>
        <ul className={BULLETS_CLASS}>
          <li>
            The structural <code>NamedAlternativeGroup</code> path is validated only against a{" "}
            <strong className="font-semibold text-foreground">hand-authored fixture</strong> — no
            real ChemDraw file exercises it, so real-world alternative-group connection conventions
            are unverified.
          </li>
          <li>
            <strong className="font-semibold text-foreground">
              Multi-atom alternative-group substituents
            </strong>{" "}
            can error (the external-connection-point <code>*</code> is dropped).
          </li>
          <li>
            Common shorthands such as <code>Me</code> are absent from the SMILES lookup tables and
            are not valid SMILES, so <code>R = Me</code> alone does not resolve.
          </li>
          <li>
            A known fallback issue: expanded R-groups are reported as successful even when
            substitution produced no structures.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "untrusted-input",
    title: "6. Security posture on untrusted input",
    body: (
      <>
        <p>
          Uploaded CDXML is screened before it is parsed. The XML prolog is inspected, and the
          upload is rejected with a <code>415</code> if it carries any <code>&lt;!ENTITY&gt;</code>{" "}
          declaration, or a <code>&lt;!DOCTYPE&gt;</code> with an internal subset or a system
          identifier other than the two known ChemDraw DTDs. That closes the XXE primitives — local
          file reads and requests to internal services — at the boundary.
        </p>
        <p>
          The residual gap is upstream: the Java XML reader itself does not explicitly disable
          external entities or DTDs.{" "}
          <strong className="font-semibold text-foreground">
            The upload screen is therefore the whole defence
          </strong>{" "}
          — anything that reaches the Java parser is trusted by it. Relevant if you run this
          codebase with the screen bypassed, or call the library directly.
        </p>
      </>
    ),
  },
  {
    id: "configurability",
    title: "7. Limited configurability",
    body: (
      <ul className={BULLETS_CLASS}>
        <li>Atom-count and AuxInfo limits are compile-time constants.</li>
        <li>
          Reader strictness is governed by a compile-time constant; there is no option to toggle
          strict vs. best-effort parsing per call.
        </li>
      </ul>
    ),
  },
  {
    id: "test-coverage",
    title: "8. Test-coverage gaps in chemistry-critical code",
    body: (
      <>
        <p>
          No dedicated unit tests exist for several non-trivial, correctness-critical classes in the
          library — they are exercised only indirectly through integration tests: the stereo
          handler, sugar-projection detector, chemical utilities, S-group handler, the text /
          bracket / reaction-step visitors, and the lookup classes.
        </p>
        <p>
          Coverage has no minimum threshold, and the static-analysis and CVE gates are advisory, so
          quality can regress without a signal.
        </p>
      </>
    ),
  },
];

const WORKS_WELL: React.ReactNode[] = [
  "Atoms, bonds, stereo (from wedge/dash geometry), charges, isotopes, rings",
  <>
    InChI + InChIKey, canonical / isomeric SMILES, extended SMILES (CXSMILES), MDL V3000 mol block,
    molecular formula
  </>,
  <>
    Abbreviation expansion (<code>Ph</code>, S-groups, …) and sugar-projection detection (Chair /
    Haworth)
  </>,
  "Structure depiction via CDK — SVG in the browser, PNG on export",
];

const MISSING: React.ReactNode[] = [
  <>
    <strong className="font-semibold text-foreground">Non-ChemDraw inputs</strong> — no MOL/SDF or
    other ingest; the entry point is strictly ChemDraw <code>.cdx</code> / <code>.cdxml</code>.
  </>,
  <>
    <strong className="font-semibold text-foreground">Full CDX(ML) fidelity</strong> — arrows,
    bio-shapes, colored areas, and link nodes are not faithfully preserved.
  </>,
  <>
    <strong className="font-semibold text-foreground">Robust reaction semantics</strong> — atom-atom
    mapping, reaction roles, and conditions beyond the experimental heuristics.
  </>,
  <>
    <strong className="font-semibold text-foreground">Runtime configuration</strong> — of safety
    limits and parser strictness.
  </>,
];

/** Shared prose treatment for the boxed sections (inline `<code>` styling included). */
const PROSE_CLASS =
  "flex flex-col gap-3 text-sm leading-relaxed text-foreground-muted [&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:text-foreground";

export function LimitationsPage() {
  return (
    <PageContainer data-slot="limitations-page">
      <LegalPageHeader
        icon={<TriangleAlertIcon aria-hidden="true" className="size-3.5" />}
        eyebrow="Limitations"
        title="Limitations & known gaps"
        lede="An honest account of what BChemXtract can and cannot do today, where it fails, and what is missing. Read it before relying on BChemXtract for anything beyond discrete small-molecule extraction."
      />

      {/* TL;DR leads — anyone who reads one block should read this one. Elevated
          surface so it reads as a pull-quote rather than a peer section. */}
      <section
        aria-labelledby="limitations-tldr-heading"
        className="mt-8 rounded-lg border border-border bg-surface-elevated p-6 sm:p-8"
        data-slot="limitations-tldr"
      >
        <h2
          id="limitations-tldr-heading"
          className="text-caption font-semibold uppercase tracking-wider text-foreground-muted"
        >
          TL;DR
        </h2>
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-foreground">
          Extracting individual small-to-medium chemical structures from ChemDraw into InChI /
          SMILES / mol is <strong className="font-semibold">mature and battle-tested</strong>.
          Reactions, very large molecules, Markush alternative-groups, wavy-bond E/Z, and
          non-chemistry drawing constructs are{" "}
          <strong className="font-semibold">weaker, experimental, or silently dropped</strong>. When
          fidelity matters, validate against the source file.
        </p>
      </section>

      <section
        aria-labelledby="limitations-works-heading"
        className="mt-8 rounded-lg border border-border bg-surface p-6 sm:p-8"
        data-slot="limitations-works-well"
      >
        <h2 id="limitations-works-heading" className="text-lg font-semibold text-foreground">
          What works well
        </h2>
        <div className={cn("mt-3 max-w-[70ch]", PROSE_CLASS)}>
          <p>
            Single-structure extraction is the mature core and runs Beilstein's Diamond Open Access
            publishing pipeline in production. It complements{" "}
            <Link to="/about" className={LEGAL_LINK_CLASS}>
              the feature list on the About page
            </Link>
            . For a well-drawn structure in either <code>.cdx</code> (binary) or <code>.cdxml</code>{" "}
            (XML) you reliably get:
          </p>
          <ul className={BULLETS_CLASS}>
            {WORKS_WELL.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p>
            Both parsers converge on one format-agnostic object model, so downstream behavior is
            consistent across the two file formats.
          </p>
        </div>
      </section>

      {/* At a glance — doubles as the TOC: each row number anchors to its
          detail section below, so no separate nav is needed. */}
      <section
        aria-labelledby="limitations-glance-heading"
        className="mt-8 rounded-lg border border-border bg-surface p-6 sm:p-8"
        data-slot="limitations-glance"
      >
        <h2 id="limitations-glance-heading" className="text-lg font-semibold text-foreground">
          Limitations at a glance
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm" data-slot="limitations-glance-table">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-4 font-semibold text-foreground">
                  #
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold text-foreground">
                  Area
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold text-foreground">
                  Limitation
                </th>
                <th scope="col" className="py-2 font-semibold text-foreground">
                  Severity
                </th>
              </tr>
            </thead>
            <tbody>
              {GLANCE.map((row, i) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 align-top tabular-nums">
                    <a
                      href={`#${row.id}`}
                      className={LEGAL_LINK_CLASS}
                      aria-label={`Jump to ${row.area} details`}
                    >
                      {i + 1}
                    </a>
                  </td>
                  <td className="py-2.5 pr-4 align-top font-medium text-foreground">{row.area}</td>
                  <td className="py-2.5 pr-4 align-top text-foreground-muted">{row.limitation}</td>
                  <td className="py-2.5 align-top">
                    <Badge variant={SEVERITY_VARIANT[row.severity]}>{row.severity}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="mt-12 text-lg font-semibold text-foreground">Details</h2>
      <div className="mt-4 flex flex-col gap-8">
        {DETAILS.map((d) => (
          <section
            key={d.id}
            id={d.id}
            aria-labelledby={`${d.id}-heading`}
            className="scroll-mt-[calc(var(--header-height)_+_3rem)] rounded-lg border border-border bg-surface p-6 sm:p-8"
            data-slot={`limitation-${d.id}`}
          >
            <h3 id={`${d.id}-heading`} className="text-base font-semibold text-foreground">
              {d.title}
            </h3>
            <div className={cn("mt-3 max-w-[70ch]", PROSE_CLASS)}>{d.body}</div>
          </section>
        ))}
      </div>

      <section
        aria-labelledby="limitations-missing-heading"
        className="mt-8 rounded-lg border border-border bg-surface p-6 sm:p-8"
        data-slot="limitations-missing"
      >
        <h2 id="limitations-missing-heading" className="text-lg font-semibold text-foreground">
          Missing outright
        </h2>
        <div className={cn("mt-3 max-w-[70ch]", PROSE_CLASS)}>
          <ul className={BULLETS_CLASS}>
            {MISSING.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Reporting — fine print, deliberately unboxed so it reads as a closing
          note rather than a peer section. */}
      <section
        aria-labelledby="limitations-reporting-heading"
        className="mt-12 border-t border-border pt-10"
        data-slot="limitations-reporting"
      >
        <h2 id="limitations-reporting-heading" className="text-lg font-semibold text-foreground">
          Reporting
        </h2>
        <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-foreground-muted">
          Found a limitation not listed here, or a case that should work but does not? Please open a{" "}
          <a
            href={UPSTREAM_ISSUES_URL}
            target="_blank"
            rel="noreferrer"
            className={cn("inline-flex items-center gap-1", LEGAL_LINK_CLASS)}
          >
            GitHub issue
            <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
          </a>{" "}
          or email{" "}
          <a href={`mailto:${OPEN_SOURCE_EMAIL}`} className={LEGAL_LINK_CLASS}>
            {OPEN_SOURCE_EMAIL}
          </a>
          .
        </p>
      </section>
    </PageContainer>
  );
}
