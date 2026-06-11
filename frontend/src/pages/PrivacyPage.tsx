/**
 * PrivacyPage — GDPR privacy notice specific to BChemXtractWeb.
 *
 * Written against the actual data flows in this codebase:
 *   - No user accounts; uploads are associated only with an extraction
 *     record in PostgreSQL (backend/app/models/orm.py: Extraction,
 *     Substance, ExtractionSubstance tables).
 *   - Client IP is unwrapped from X-Forwarded-For by the rate-limiter
 *     middleware (backend/app/middleware/rate_limit.py) — processed
 *     transiently, not persisted on application rows.
 *   - Uvicorn's access log records the standard request line with the
 *     client address until log rotation.
 *   - No cookies. Two client-side storage keys:
 *       localStorage  "bchemxtract-theme"                    (theme choice)
 *       sessionStorage "bcx.reactions.experimentalBannerDismissed"
 *   - No web analytics. No third-party embeds. No fonts fetched from
 *     third-party CDNs (JetBrains Mono is self-hosted via fontsource).
 *
 * Controller identification + supervisory-authority details come from
 * https://www.beilstein-institut.de/en/privacy-policy/ and are reproduced
 * with attribution at the foot of the page.
 */
import { ArrowUpRightIcon, ShieldCheckIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { Link } from "@/lib/Link";
import { cn } from "@/lib/utils";
import { LEGAL_LINK_CLASS, LegalPageHeader } from "@/pages/legalShared";

interface Topic {
  id: string;
  title: string;
  body: React.ReactNode;
}

const TOPICS: Topic[] = [
  {
    id: "controller",
    title: "Controller and data protection officer",
    body: (
      <>
        <p>
          The controller under Art. 4(7) GDPR is the Beilstein-Institut zur Förderung der Chemischen
          Wissenschaften, Trakehner Straße 7–9, 60487 Frankfurt am Main, Germany (telephone: +49 (0)
          69 71673-20, email:{" "}
          <a href="mailto:info@beilstein-institut.de" className={LEGAL_LINK_CLASS}>
            info@beilstein-institut.de
          </a>
          ). The Beilstein-Institut's data protection officer can be reached at{" "}
          <a href="mailto:datenschutz@beilstein-institut.de" className={LEGAL_LINK_CLASS}>
            datenschutz@beilstein-institut.de
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "uploads",
    title: "Processing of uploaded ChemDraw files",
    body: (
      <>
        <p>
          When you extract a file via the Extract page, your browser sends the selected ChemDraw
          file (<code>.cdx</code> or <code>.cdxml</code>) to our server. The server parses the file,
          runs structure extraction via the BChemXtract Java library, and persists an extraction
          record to our PostgreSQL database together with the extracted chemical structures. The
          record contains the original file name, file size, format, structure count, processing
          time, and any warnings emitted by the extractor.
        </p>
        <p>
          Extracted structures are deduplicated by InChIKey and stored as SMILES, InChI, molecular
          formula, MDL V3000 block, and rendered SVG. These records are retained until you delete
          them via the{" "}
          <Link to="/history" className={LEGAL_LINK_CLASS}>
            History page
          </Link>
          .
        </p>
        <p>
          The legal basis for this processing is Art. 6(1)(b) GDPR (performance of the service you
          requested). Do not upload files that contain personal data.
        </p>
      </>
    ),
  },
  {
    id: "logs",
    title: "Server logs and rate limiting",
    body: (
      <>
        <p>
          Each HTTP request reaches the application server via Uvicorn, which writes a standard
          access-log line containing the client's IP address (or the forwarded address supplied by
          our reverse proxy), timestamp, request method and path, HTTP status, response size, user
          agent, and referrer.
        </p>
        <p>
          The rate-limiter middleware inspects the client IP transiently on each request to decide
          whether to permit or throttle it; the IP is not written to application tables and is
          discarded at the end of the request. Server log files inherit the retention of the
          Beilstein-Institut's broader web-log policy, which ordinarily deletes them after the visit
          and retains them for up to seven days only in exceptional circumstances (e.g. security
          incident analysis).
        </p>
        <p>
          The legal basis is Art. 6(1)(f) GDPR (legitimate interest in delivering a stable, secure
          service) and, for security-incident analysis, Art. 6(1)(c) GDPR in conjunction with Art.
          32 GDPR.
        </p>
      </>
    ),
  },
  {
    id: "client-storage",
    title: "Browser storage",
    body: (
      <>
        <p>BChemXtractWeb uses no cookies. Two entries are stored in your browser:</p>
        <ul className="ml-5 list-disc space-y-1 marker:text-foreground-muted">
          <li>
            <code>localStorage["bchemxtract-theme"]</code> — your chosen colour theme (
            <code>light</code>, <code>dark</code>, or <code>system</code>). Written only when you
            change the theme.
          </li>
          <li>
            <code>sessionStorage["bcx.reactions.experimentalBannerDismissed"]</code> — records that
            you dismissed the "experimental" banner on the Reactions tab for the current browser
            session.
          </li>
        </ul>
        <p>
          Both entries are stored only in your browser, are never sent to the server, and contain no
          personal data. You can clear them at any time through your browser's site-data settings.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party services and tracking",
    body: (
      <>
        <p>
          BChemXtractWeb loads no third-party analytics, no advertising, no social tracking pixels,
          and no external fonts. The JetBrains Mono webfont used by the interface is self-hosted
          from our own origin via the fontsource package.
        </p>
        <p>
          The only outbound requests your browser makes are to this site itself. External links (for
          example on the About and Terms and conditions pages) are plain anchors that you follow
          explicitly.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>You have the following rights under the GDPR:</p>
        <ul className="ml-5 list-disc space-y-1 marker:text-foreground-muted">
          <li>Access to your personal data (Art. 15)</li>
          <li>Rectification of inaccurate data (Art. 16)</li>
          <li>
            Erasure (Art. 17) — for extraction records you can delete them yourself from the History
            page, or contact us
          </li>
          <li>Restriction of processing (Art. 18)</li>
          <li>Data portability (Art. 20)</li>
          <li>Objection to processing (Art. 21)</li>
          <li>Withdrawal of consent at any time with effect for the future (Art. 7(3))</li>
        </ul>
        <p>
          To exercise any of these rights, contact the controller or the data protection officer at
          the addresses above.
        </p>
      </>
    ),
  },
  {
    id: "supervisory-authority",
    title: "Right to lodge a complaint",
    body: (
      <>
        <p>
          If you believe the processing of your personal data infringes the GDPR, you can lodge a
          complaint with a supervisory authority. The authority competent for the Beilstein-Institut
          is the Hessian Commissioner for Data Protection and Freedom of Information (Der Hessische
          Beauftragte für Datenschutz und Informationsfreiheit), Postfach 3163, 65021 Wiesbaden,
          Germany.
        </p>
      </>
    ),
  },
];

export function PrivacyPage() {
  return (
    <PageContainer data-slot="privacy-page">
      <LegalPageHeader
        icon={<ShieldCheckIcon aria-hidden="true" className="size-3.5" />}
        eyebrow="Privacy"
        title="Privacy notice"
        lede="How BChemXtractWeb handles personal data. This notice describes only what the web application itself does. The Beilstein-Institut publishes a broader privacy policy covering its other activities; see the link at the foot of this page."
      />

      <nav
        aria-label="Privacy notice contents"
        className="mt-8 rounded-lg border border-border bg-surface-elevated p-4 sm:p-5"
        data-slot="privacy-toc"
      >
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {TOPICS.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="text-primary underline-offset-4 hover:underline">
                {t.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 flex flex-col gap-8">
        {TOPICS.map((t) => (
          <section
            key={t.id}
            id={t.id}
            aria-labelledby={`${t.id}-heading`}
            className="scroll-mt-28 rounded-lg border border-border bg-surface p-6 sm:p-8"
            data-slot={`privacy-${t.id}`}
          >
            <h2 id={`${t.id}-heading`} className="text-lg font-semibold text-foreground">
              {t.title}
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-foreground [&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem]">
              {t.body}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-caption text-foreground-muted">
        Controller and supervisory-authority details reproduced from the{" "}
        <a
          href="https://www.beilstein-institut.de/en/privacy-policy/"
          target="_blank"
          rel="noreferrer"
          className={cn("inline-flex items-center gap-1", LEGAL_LINK_CLASS)}
        >
          Beilstein-Institut's full privacy policy
          <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
        </a>
        .
      </p>
    </PageContainer>
  );
}
