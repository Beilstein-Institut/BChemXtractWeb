/**
 * LimitationsPage — honest account of what extraction does and does not do.
 *
 * Plain-language retelling of the upstream BChemXtract LIMITATIONS document,
 * written for chemists rather than developers: chemistry vocabulary stays,
 * software vocabulary (class names, HTTP codes, build-time constants) goes.
 * Two entries also differ on substance, because upstream describes the bare
 * Java library rather than this web app:
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

const BULLETS_CLASS = "ml-5 list-disc space-y-1.5 marker:text-foreground-muted";

interface Limitation {
  /** Anchor id — the glance row links to the detail section carrying it. */
  id: string;
  /** Glance-table "Area" column. */
  area: string;
  /** Glance-table one-liner. */
  summary: string;
  severity: Severity;
  /** Detail-section heading, unnumbered — the number comes from array order. */
  title: string;
  body: React.ReactNode;
}

/**
 * One entry per limitation, rendered twice: as a glance-table row and as a
 * detail section below it. Array order is the number users see in both places,
 * so reordering here keeps the table and the headings in step.
 */
const LIMITATIONS: Limitation[] = [
  {
    id: "reactions",
    area: "Reactions",
    summary: "Experimental — which molecule is a reactant or a product is guessed from the drawing",
    severity: "High",
    title: "Reaction extraction is still experimental",
    body: (
      <p>
        Reactions are a preview, not a finished feature. Which molecules count as reactants,
        products, or reagents is worked out from{" "}
        <strong>how they are arranged around the arrow</strong> — so a crowded scheme, an unusual
        layout, or a multi-step sequence can easily be grouped the wrong way. You do get a RInChI
        and a reaction SMILES out of it, but please check reaction results yourself before relying
        on them.
      </p>
    ),
  },
  {
    id: "cdxml-fidelity",
    area: "Drawing details",
    summary: "Arrows, shapes and colours are dropped, and nothing tells you so",
    severity: "Medium-High",
    title: "Parts of the drawing disappear without warning",
    body: (
      <>
        <p>
          This is a tool for reading the <strong>chemistry</strong> out of a file, not for
          reproducing the drawing itself. Elements that carry no chemical meaning are quietly left
          behind, and nothing in the results points that out — the only way to notice is to compare
          with your original file. What goes missing:
        </p>
        <ul className={BULLETS_CLASS}>
          <li>Arrows and biological shapes (membranes, cells, DNA strands, and the like)</li>
          <li>Link nodes — the shorthand for a repeating part of a structure</li>
          <li>
            Coloured areas behind molecules, which are read but lost again if the file is written
            back out
          </li>
          <li>Dipole arrows, which are not supported at all</li>
          <li>Arrowhead styles, which the underlying library itself flags as not fully verified</li>
        </ul>
      </>
    ),
  },
  {
    id: "large-structures",
    area: "Large structures",
    summary: "Above 100 heavy atoms there is no InChI, no InChIKey, and no PubChem match",
    severity: "Medium",
    title: "Very large structures come back with fewer identifiers",
    body: (
      <>
        <p>
          Working out an InChI gets disproportionately slower as a molecule grows: an everyday
          molecule is done in a fraction of a second, while a large, highly symmetric cage of 162
          atoms can take around five minutes. So that one upload cannot hold up everyone else, we
          skip the InChI, the InChIKey, and the extra AuxInfo layer{" "}
          <strong>for anything above 100 heavy (non-hydrogen) atoms</strong>. Where the molecular
          formula cannot be read at all, the same skip applies to any SMILES longer than 1500
          characters.
        </p>
        <p>For those structures:</p>
        <ul className={BULLETS_CLASS}>
          <li>
            The InChI and InChIKey fields come back <strong>empty</strong>, and repeats of the same
            structure are recognised by their SMILES instead.
          </li>
          <li>
            PubChem enrichment is unavailable — a lookup needs a proper InChIKey, so a structure
            without one cannot be matched.
          </li>
          <li>AuxInfo longer than 4000 characters is dropped.</li>
        </ul>
        <p>
          In practice this is what you will see with large peptides, polymers, and big natural
          products. The underlying library stops at 500 atoms of its own accord, but our lower limit
          is the one you meet first. Neither can be changed while the app is running.
        </p>
      </>
    ),
  },
  {
    id: "stereo",
    area: "Stereochemistry",
    summary:
      "With a wavy bond, the SMILES and the InChI can describe the same molecule differently",
    severity: "Medium",
    title: "Stereochemistry: one honest disagreement",
    body: (
      <>
        <p>
          Stereochemistry drawn with wedges and dashes comes through reliably, and structures now
          keep it intact when they pass through a mol file. One case is deliberately left open:
        </p>
        <ul className={BULLETS_CLASS}>
          <li>
            A <strong>double bond drawn with a wavy substituent</strong> is how a chemist says "E/Z
            deliberately unspecified". The SMILES respects that and leaves the configuration out,
            while the InChI reads E/Z back from the way the bond sits on the page. The same molecule
            can therefore end up with descriptors that disagree. That is a question of chemical
            intent we have not settled yet, rather than a bug waiting to be fixed.
          </li>
        </ul>
        <p>
          Related, and worth knowing: where a stereocentre is left undefined, the InChI falls back
          on the drawn coordinates for that centre.{" "}
          <strong>How a structure is laid out on the page is therefore not purely cosmetic</strong>{" "}
          — it can change the InChIKey.
        </p>
      </>
    ),
  },
  {
    id: "markush",
    area: "R-groups",
    summary: "Barely tested against real files; substituents of more than one atom can fail",
    severity: "Medium",
    title: "R-group (Markush) structures have soft edges",
    body: (
      <>
        <p>
          Turning an R-group drawing into the individual structures it stands for is optional, and
          the number of combinations grows quickly. What we know is shaky:
        </p>
        <ul className={BULLETS_CLASS}>
          <li>
            The handling of alternative-group drawings has only ever been checked against an example
            we wrote ourselves. <strong>No real-world file has exercised it</strong>, so we cannot
            promise it copes with the conventions people actually draw with.
          </li>
          <li>
            <strong>Substituents made of more than one atom</strong> can fail outright, because the
            marker showing where they attach gets lost.
          </li>
          <li>
            Everyday shorthand is missing from the lookup table, so an R defined only as{" "}
            <code>Me</code> does not resolve to a methyl group.
          </li>
          <li>
            Expansion sometimes reports success even when it produced no structures at all — so an
            empty result is not always announced as a failure.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "untrusted-input",
    area: "Unsafe files",
    summary: "Uploads are screened for booby-trapped XML; the reader underneath is not hardened",
    severity: "Low",
    title: "What happens with a file that is out to cause trouble",
    body: (
      <>
        <p>
          A CDXML file is really a text document, and text documents can be written to trick a
          careless reader into opening other files on the server. Every upload is therefore screened
          before it is parsed: if it declares content of its own to pull in, or refers to anything
          other than the two known ChemDraw document types, it is rejected on the spot and you get
          an "unsupported file" error (HTTP 415). That closes the door on files fishing for
          server-side data.
        </p>
        <p>
          The gap sits one level below us: the reader inside the library does not switch those
          features off itself. <strong>The screen at upload is the whole defence</strong> — anything
          that gets past it is trusted. Worth knowing only if you run this code with the screen
          disabled, or use the library directly.
        </p>
      </>
    ),
  },
  {
    id: "configurability",
    area: "Settings",
    summary: "Size limits and how strictly files are read are fixed",
    severity: "Low-Medium",
    title: "There is very little you can adjust",
    body: (
      <ul className={BULLETS_CLASS}>
        <li>
          The size limits described above are fixed. There is no setting to raise or lower them.
        </li>
        <li>
          How strictly a file is read is fixed too — you cannot ask for a second, more forgiving
          attempt at a file that was refused.
        </li>
      </ul>
    ),
  },
  {
    id: "test-coverage",
    area: "Testing",
    summary: "Several chemistry routines have no tests written specifically for them",
    severity: "Medium",
    title: "Parts of the chemistry are not directly tested",
    body: (
      <>
        <p>
          Several pieces of the underlying library have no tests of their own. They are only covered
          indirectly, as a side effect of testing something bigger — among them the stereochemistry
          handling, sugar-projection detection, S-group handling, and the routines that read text,
          brackets, and reaction steps.
        </p>
        <p>
          There is also no minimum bar for how much of the code the tests have to reach, and the
          automated quality and security checks report problems rather than block a release. A
          mistake can therefore slip in without anything raising a flag.
        </p>
      </>
    ),
  },
];

/** Card shell shared by the boxed sections and the numbered detail sections. */
const BOX_CLASS = "rounded-lg border border-border bg-surface p-6 sm:p-8";

/**
 * Shared prose treatment for the boxed sections. Inline `<code>` and `<strong>`
 * are styled here rather than per-element, so the copy below stays free of
 * presentation classes.
 */
const PROSE_CLASS =
  "mt-3 flex max-w-[70ch] flex-col gap-3 text-sm leading-relaxed text-foreground-muted [&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:text-foreground [&_strong]:font-semibold [&_strong]:text-foreground";

interface SectionProps {
  /** Stable `data-slot` hook — tests and the axe sweep anchor on these. */
  slot: string;
  /** Id given to the heading and referenced by the section's `aria-labelledby`. */
  headingId: string;
  heading: string;
  className?: string;
  /** Override for the default `text-lg` heading treatment. */
  headingClassName?: string;
  children: React.ReactNode;
}

/** Boxed page section with its heading wired up for `aria-labelledby`. */
function Section({
  slot,
  headingId,
  heading,
  className,
  headingClassName,
  children,
}: SectionProps) {
  return (
    <section aria-labelledby={headingId} className={cn(BOX_CLASS, className)} data-slot={slot}>
      <h2 id={headingId} className={cn("text-lg font-semibold text-foreground", headingClassName)}>
        {heading}
      </h2>
      {children}
    </section>
  );
}

export function LimitationsPage() {
  return (
    <PageContainer data-slot="limitations-page">
      <LegalPageHeader
        icon={<TriangleAlertIcon aria-hidden="true" className="size-3.5" />}
        eyebrow="Limitations"
        title="Limitations & known gaps"
        lede="A plain account of what BChemXtract does well today, where it struggles, and what it simply cannot do. Worth reading before you lean on it for anything beyond everyday single structures."
      />

      {/* TL;DR leads — anyone who reads one block should read this one. Elevated
          surface so it reads as a pull-quote rather than a peer section. */}
      <Section
        slot="limitations-tldr"
        headingId="limitations-tldr-heading"
        heading="In short"
        className="mt-8 bg-surface-elevated"
        headingClassName="text-caption font-semibold uppercase tracking-wider text-foreground-muted"
      >
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-foreground">
          Reading individual small-to-medium structures out of a drawing and turning them into an
          InChI, a SMILES, or a mol file is{" "}
          <strong className="font-semibold">mature and well proven</strong>. Reactions, very large
          molecules, R-group drawings, wavy-bond stereochemistry, and anything that is drawing
          rather than chemistry are{" "}
          <strong className="font-semibold">weaker, experimental, or quietly left out</strong>. When
          the details matter, check the results against your original file.
        </p>
      </Section>

      <Section
        slot="limitations-works-well"
        headingId="limitations-works-heading"
        heading="What works well"
        className="mt-8"
      >
        <div className={PROSE_CLASS}>
          <p>
            Reading single structures is the mature heart of the tool, and it runs Beilstein's
            Diamond Open Access publishing every day. It sits alongside{" "}
            <Link to="/about" className={LEGAL_LINK_CLASS}>
              the feature list on the About page
            </Link>
            . For a cleanly drawn structure, in either <code>.cdx</code> or <code>.cdxml</code>, you
            can count on getting:
          </p>
          <ul className={BULLETS_CLASS}>
            <li>
              Atoms, bonds, rings, charges, isotopes, and the stereochemistry drawn with wedges and
              dashes
            </li>
            <li>
              InChI and InChIKey, SMILES (plain and stereochemistry-aware), extended SMILES, an MDL
              V3000 mol file, and the molecular formula
            </li>
            <li>
              Abbreviations written out in full (<code>Ph</code> and similar shorthand)
            </li>
            <li>A picture of every structure — on screen, and as an image file when you export</li>
          </ul>
          <p>
            Both file types are read into the same internal form, so you get the same results either
            way.
          </p>
        </div>
      </Section>

      {/* At a glance — doubles as the TOC: each row number anchors to its
          detail section below, so no separate nav is needed. */}
      <Section
        slot="limitations-glance"
        headingId="limitations-glance-heading"
        heading="Limitations at a glance"
        className="mt-8"
      >
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
              {LIMITATIONS.map((limitation, i) => (
                <tr key={limitation.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 align-top tabular-nums">
                    <a
                      href={`#${limitation.id}`}
                      className={LEGAL_LINK_CLASS}
                      aria-label={`Jump to ${limitation.area} details`}
                    >
                      {i + 1}
                    </a>
                  </td>
                  <td className="py-2.5 pr-4 align-top font-medium text-foreground">
                    {limitation.area}
                  </td>
                  <td className="py-2.5 pr-4 align-top text-foreground-muted">
                    {limitation.summary}
                  </td>
                  <td className="py-2.5 align-top">
                    <Badge variant={SEVERITY_VARIANT[limitation.severity]}>
                      {limitation.severity}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <h2 className="mt-12 text-lg font-semibold text-foreground">Details</h2>
      <div className="mt-4 flex flex-col gap-8">
        {LIMITATIONS.map((limitation, i) => (
          <section
            key={limitation.id}
            id={limitation.id}
            aria-labelledby={`${limitation.id}-heading`}
            className={cn("scroll-mt-[calc(var(--header-height)_+_3rem)]", BOX_CLASS)}
            data-slot={`limitation-${limitation.id}`}
          >
            <h3 id={`${limitation.id}-heading`} className="text-base font-semibold text-foreground">
              {i + 1}. {limitation.title}
            </h3>
            <div className={PROSE_CLASS}>{limitation.body}</div>
          </section>
        ))}
      </div>

      <Section
        slot="limitations-missing"
        headingId="limitations-missing-heading"
        heading="Not there at all"
        className="mt-8"
      >
        <div className={PROSE_CLASS}>
          <ul className={BULLETS_CLASS}>
            <li>
              <strong>Other file types</strong> — only <code>.cdx</code> and <code>.cdxml</code> go
              in. There is no MOL or SDF import.
            </li>
            <li>
              <strong>A faithful copy of your drawing</strong> — arrows, shapes, coloured areas, and
              link nodes are not preserved.
            </li>
            <li>
              <strong>Dependable reaction chemistry</strong> — no atom-to-atom mapping, and no
              reliable roles or reaction conditions beyond the guesswork described above.
            </li>
            <li>
              <strong>Adjustable limits</strong> — the size caps and the strictness of the reader
              are fixed.
            </li>
          </ul>
        </div>
      </Section>

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
          Hit something that should have worked, or a limitation we have not listed here? Please
          open a{" "}
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
