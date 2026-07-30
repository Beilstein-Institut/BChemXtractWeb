/**
 * ImprintPage — legal identification of the site operator ("Impressum").
 *
 * The wording is the institute's official Impressum text verbatim (source:
 * "Impressum BChemXtract 2026-1.docx", supplied by the Beilstein-Institut)
 * and carries nothing beyond it. No VAT ID and no §18 MStV content-officer
 * are listed: the institute has no VAT ID, and the site is not a
 * journalistic / editorial offering, so the Interstate Media Treaty
 * responsibility notice does not apply.
 *
 * The route stays /imprint; only the visible label is the German
 * "Impressum", which is the legally recognised term.
 */
import { BuildingIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { LEGAL_LINK_CLASS, LegalPageHeader } from "@/pages/legalShared";

interface LabelledEntry {
  label: string;
  value: React.ReactNode;
}

const OPERATOR_NAME = "Beilstein-Institut zur Förderung der Chemischen Wissenschaften";

// Name leads the block; everything else is a label/value detail row (contact +
// governance folded together — governance was only two facts and did not earn
// its own boxed section). Labels mirror the source document.
const DETAILS: LabelledEntry[] = [
  {
    label: "Address",
    value: (
      <>
        Trakehner Str. 7-9
        <br />
        60487 Frankfurt am Main
        <br />
        Germany
      </>
    ),
  },
  { label: "Phone", value: "+49 69 716732-0" },
  { label: "Fax", value: "+49 69 716732-19" },
  {
    label: "Email",
    value: (
      <a href="mailto:info@beilstein-institut.de" className={LEGAL_LINK_CLASS}>
        info@beilstein-institut.de
      </a>
    ),
  },
  {
    label: "Internet",
    value: (
      <a
        href="http://www.beilstein-institut.de"
        target="_blank"
        rel="noreferrer"
        className={LEGAL_LINK_CLASS}
      >
        http://www.beilstein-institut.de
      </a>
    ),
  },
  { label: "Board members", value: "Olaf Beckmann-Haag, Dr. Wendy Patterson" },
  { label: "Foundation Number", value: "(AZ): III 21-25d 04/11-(12)-22" },
];

export function ImprintPage() {
  return (
    <PageContainer data-slot="imprint-page">
      <LegalPageHeader
        icon={<BuildingIcon aria-hidden="true" className="size-3.5" />}
        eyebrow="Impressum"
        title="Impressum"
        lede="This website is operated by the Beilstein-Institut zur Förderung der Chemischen Wissenschaften."
      />

      {/* Operator identity — the single structured block. The institute's mark
          leads, then the name as focal point; contact + governance details sit
          below a hairline. The mark is transparent artwork; it gets a white
          plate in dark mode only, because the wordmark is dark navy and a
          protected trademark that must not be recoloured. */}
      <section
        aria-labelledby="imprint-operator-name"
        className="mt-10 rounded-lg border border-border bg-surface p-6 sm:p-8"
        data-slot="imprint-entity"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div>
            <h2
              id="imprint-operator-name"
              className="text-xl font-semibold leading-snug text-foreground sm:text-2xl"
            >
              {OPERATOR_NAME}
            </h2>
            <p className="mt-1.5 text-sm text-foreground-muted">
              The Beilstein-Institut is a foundation established under civil law.
            </p>
          </div>
          <img
            src="/beilstein-institut-logo.png"
            alt="Beilstein-Institut"
            width={400}
            height={183}
            className="h-21 w-auto shrink-0 self-start px-4 py-3 dark:rounded-md dark:bg-white"
          />
        </div>

        <dl className="mt-6 grid gap-x-10 gap-y-3.5 border-t border-border pt-6 text-sm sm:grid-cols-[max-content_1fr]">
          {DETAILS.map(({ label, value }) => (
            <div key={label} className="contents" data-slot="imprint-entity-row">
              <dt className="text-foreground-muted">{label}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Liability + copyright — fine print, deliberately not boxed so it reads
          as a secondary zone rather than a second equal-weight card. */}
      <section
        aria-labelledby="imprint-liability-heading"
        className="mt-12 border-t border-border pt-10"
        data-slot="imprint-liability"
      >
        <h2 id="imprint-liability-heading" className="text-lg font-semibold text-foreground">
          Disclaimer
        </h2>
        <div className="mt-4 max-w-[70ch] space-y-3 text-sm leading-relaxed text-foreground-muted">
          <p>
            Despite careful checking of external links, we are not liable for any of their content.
            The responsibility for the content of the linked website is exclusively with the
            operators of this website.
          </p>
          <p>
            We have tried to ensure that all information provided through our website is complete
            and accurate. However in view of the possibility of human error or changes in scientific
            knowledge, we do not warrant that the information included on the site is in every
            respect accurate or complete, and we are not responsible for any errors or omissions or
            the result obtained from use of such information.
          </p>
        </div>
        <p
          className="mt-6 max-w-[70ch] text-caption text-foreground-muted"
          data-slot="imprint-copyright"
        >
          Copyright © 2026 Beilstein-Institut zur Förderung der Chemischen Wissenschaften.
        </p>
      </section>
    </PageContainer>
  );
}
