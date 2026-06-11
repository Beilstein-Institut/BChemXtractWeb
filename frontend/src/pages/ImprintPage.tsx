/**
 * ImprintPage — legal identification of the site operator.
 *
 * BChemXtractWeb is operated by / under the Beilstein-Institut zur Förderung
 * der Chemischen Wissenschaften (a German civil-law foundation). The imprint
 * below reproduces the entity identification published by the operator at
 * https://www.beilstein-institut.de/en/impressum/, with attribution. The
 * VAT ID and copyright notice follow the institute's standard legal notice
 * (cf. https://www.beilstein-strenda-db.org/strenda/legalNotice.xhtml). The
 * parent imprint is the authoritative legal identification for the
 * operating entity.
 */
import { ArrowUpRightIcon, BuildingIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { cn } from "@/lib/utils";
import { LEGAL_LINK_CLASS, LegalPageHeader } from "@/pages/legalShared";

interface LabelledEntry {
  label: string;
  value: React.ReactNode;
}

const ENTITY: LabelledEntry[] = [
  {
    label: "Name",
    value: "Beilstein-Institut zur Förderung der Chemischen Wissenschaften",
  },
  {
    label: "Legal form",
    value: "Civil-law foundation (rechtsfähige Stiftung des bürgerlichen Rechts)",
  },
  {
    label: "Address",
    value: (
      <>
        Trakehner Straße 7–9
        <br />
        60487 Frankfurt am Main
        <br />
        Germany
      </>
    ),
  },
  { label: "Telephone", value: "+49 (0) 69 71673-20" },
  { label: "Fax", value: "+49 (0) 69 71673-219" },
  {
    label: "Email",
    value: (
      <a href="mailto:info@beilstein-institut.de" className={LEGAL_LINK_CLASS}>
        info@beilstein-institut.de
      </a>
    ),
  },
  {
    label: "Website",
    value: (
      <a
        href="https://www.beilstein-institut.de/"
        target="_blank"
        rel="noreferrer"
        className={LEGAL_LINK_CLASS}
      >
        www.beilstein-institut.de
      </a>
    ),
  },
];

const GOVERNANCE: LabelledEntry[] = [
  {
    label: "Board",
    value: "Olaf Beckmann-Haag · Dr. Wendy Patterson",
  },
  {
    label: "Foundation reference",
    value: "AZ III 21-25d 04/11-(12)-22",
  },
  {
    label: "VAT ID (§27a UStG)",
    value: "DE 114234743",
  },
  {
    label: "Responsible for content (§18 (2) MStV)",
    value: "Dr. Wendy Patterson (address as above)",
  },
];

export function ImprintPage() {
  return (
    <PageContainer data-slot="imprint-page">
      <LegalPageHeader
        icon={<BuildingIcon aria-hidden="true" className="size-3.5" />}
        eyebrow="Imprint"
        title="Imprint"
        lede="Legal identification of the site operator pursuant to §5 of the German Digital Services Act (DDG) and §18 of the Interstate Media Treaty (MStV)."
      />

      <section
        aria-labelledby="imprint-entity-heading"
        className="mt-10 rounded-lg border border-border bg-surface p-6 sm:p-8"
        data-slot="imprint-entity"
      >
        <h2 id="imprint-entity-heading" className="text-lg font-semibold text-foreground">
          Operator
        </h2>
        <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
          {ENTITY.map(({ label, value }) => (
            <div key={label} className="contents" data-slot="imprint-entity-row">
              <dt className="text-foreground-muted">{label}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="imprint-governance-heading"
        className="mt-8 rounded-lg border border-border bg-surface p-6 sm:p-8"
        data-slot="imprint-governance"
      >
        <h2 id="imprint-governance-heading" className="text-lg font-semibold text-foreground">
          Governance
        </h2>
        <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
          {GOVERNANCE.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="text-foreground-muted">{label}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="imprint-liability-heading"
        className="mt-8 rounded-lg border border-border bg-surface p-6 sm:p-8"
        data-slot="imprint-liability"
      >
        <h2 id="imprint-liability-heading" className="text-lg font-semibold text-foreground">
          Liability for content and links
        </h2>
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-foreground-muted">
          The operator takes care to keep the information on this site accurate and up to date but
          gives no warranty as to its completeness or correctness and accepts no liability for
          errors or omissions, nor for any results arising from use of the information offered here.
        </p>
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-foreground-muted">
          This site contains links to external resources over whose content the operator has no
          control. Liability for such external content rests solely with its respective provider or
          author. At the time the links were set, no illegal content was identifiable. Ongoing
          monitoring of linked content is not reasonable without concrete evidence of infringement;
          on notice of any such infringement the operator will remove the affected link without
          delay.
        </p>
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-foreground-muted">
          All content produced by the operator on this site is protected by copyright. Reproduction,
          adaptation, distribution, or any form of exploitation beyond the limits of copyright law
          requires the written consent of the respective author or creator. Downloads and copies of
          this page are permitted for private, non-commercial use only.
        </p>
        <p
          className="mt-5 max-w-[70ch] text-sm font-medium text-foreground"
          data-slot="imprint-copyright"
        >
          Copyright © 2026 Beilstein-Institut zur Förderung der Chemischen Wissenschaften.
        </p>
      </section>

      <p className="mt-8 text-caption text-foreground-muted">
        Authoritative source:{" "}
        <a
          href="https://www.beilstein-institut.de/en/impressum/"
          target="_blank"
          rel="noreferrer"
          className={cn("inline-flex items-center gap-1", LEGAL_LINK_CLASS)}
        >
          beilstein-institut.de/en/impressum/
          <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
        </a>
        . Reproduced here with attribution so that users of BChemXtractWeb can reach the operator's
        identification without leaving the site.
      </p>
    </PageContainer>
  );
}
