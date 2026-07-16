/**
 * ImprintPage — legal identification of the site operator.
 *
 * BChemXtractWeb is operated by / under the Beilstein-Institut zur Förderung
 * der Chemischen Wissenschaften (a German civil-law foundation). The content
 * below follows the institute's official Impressum
 * (cf. https://www.beilstein-institut.de/en/impressum/) and carries nothing
 * beyond it. No VAT ID and no §18 MStV content-officer are
 * listed: the institute has no VAT ID, and the site is not a journalistic /
 * editorial offering, so the Interstate Media Treaty responsibility notice
 * does not apply.
 */
import { BuildingIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { LEGAL_LINK_CLASS, LegalPageHeader } from "@/pages/legalShared";

interface LabelledEntry {
  label: string;
  value: React.ReactNode;
}

const OPERATOR_NAME = "Beilstein-Institut zur Förderung der Chemischen Wissenschaften";
const LEGAL_FORM = "Civil-law foundation (rechtsfähige Stiftung des bürgerlichen Rechts)";

// Name + legal form lead the block; everything else is a label/value detail row
// (contact + governance folded together — governance was only two facts and did
// not earn its own boxed section).
const DETAILS: LabelledEntry[] = [
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
  { label: "Board", value: "Olaf Beckmann-Haag · Dr. Wendy Patterson" },
  { label: "Foundation reference", value: "AZ III 21-25d 04/11-(12)-22" },
];

export function ImprintPage() {
  return (
    <PageContainer data-slot="imprint-page">
      <LegalPageHeader
        icon={<BuildingIcon aria-hidden="true" className="size-3.5" />}
        eyebrow="Imprint"
        title="Imprint"
        lede="Legal identification of the site operator."
      />

      {/* Operator identity — the single structured block. The name leads as the
          focal point; contact + governance details sit below a hairline. */}
      <section
        aria-labelledby="imprint-operator-name"
        className="mt-10 rounded-lg border border-border bg-surface p-6 sm:p-8"
        data-slot="imprint-entity"
      >
        <p className="text-caption uppercase tracking-wider text-foreground-muted">Operator</p>
        <h2
          id="imprint-operator-name"
          className="mt-2 text-xl font-semibold leading-snug text-foreground sm:text-2xl"
        >
          {OPERATOR_NAME}
        </h2>
        <p className="mt-1.5 text-sm text-foreground-muted">{LEGAL_FORM}</p>

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
          as a secondary zone rather than a fourth equal-weight card. */}
      <section
        aria-labelledby="imprint-liability-heading"
        className="mt-12 border-t border-border pt-10"
        data-slot="imprint-liability"
      >
        <h2 id="imprint-liability-heading" className="text-lg font-semibold text-foreground">
          Liability for content and links
        </h2>
        <div className="mt-4 max-w-[70ch] space-y-3 text-sm leading-relaxed text-foreground-muted">
          <p>
            Despite careful checking of external links, we are not liable for the content of linked
            websites. Responsibility for the content of a linked website rests exclusively with its
            operator.
          </p>
          <p>
            We have tried to ensure that all information provided through this website is complete
            and accurate. However, in view of the possibility of human error or changes in
            scientific knowledge, we do not warrant that the information included on the site is in
            every respect accurate or complete, and we are not responsible for any errors or
            omissions, or for the results obtained from the use of such information.
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
