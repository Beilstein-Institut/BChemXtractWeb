/**
 * PrivacyPage — GDPR privacy policy for BChemXtractWeb.
 *
 * Structure follows the Beilstein-Institut's standard § 1–§ 7 policy format
 * (cf. https://www.beilstein-institut.de/en/privacy-policy/), adapted to the
 * actual data flows in this codebase:
 *   - No user accounts. An anonymous session UUID in the `bcx_sid`
 *     cookie (backend/app/core/session.py: 30 days, HttpOnly, Secure,
 *     SameSite=Lax) scopes extraction history via Postgres RLS.
 *   - Uploads persist an extraction record + structures in PostgreSQL
 *     (backend/app/models/orm.py), deletable by the user from the
 *     History page or wholesale via Settings → Delete all my data
 *     (backend/app/routers/me.py — immediate hard delete).
 *   - Security-relevant events land in audit_log with hashed session
 *     id, raw IP, and user agent (backend/app/services/audit.py);
 *     pruned daily after 365 days (backend/app/tasks/audit_log.py).
 *   - Rate limiter inspects the client IP transiently
 *     (backend/app/middleware/rate_limit.py) — never persisted on
 *     application rows.
 *   - Access logs (nginx + Uvicorn) go to the container log stream,
 *     which is size-capped and rotates (docker-compose.yml x-logging) —
 *     no archival.
 *   - Browser storage: localStorage "bchemxtract-theme",
 *     sessionStorage "bcx.reactions.experimentalBannerDismissed".
 *   - No web analytics, no third-party embeds, fonts self-hosted.
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
    id: "collection",
    title: "§ 1 Information on the collection of personal data",
    body: (
      <>
        <p>
          (1) In the following, we inform you about the processing of personal data when you use
          BChemXtractWeb. Personal data are all data that can be related to you personally, such as
          your name, address, e-mail address, or user behaviour.
        </p>
        <p>
          (2) The controller pursuant to Art. 4 (7) of the General Data Protection Regulation (GDPR)
          is the Beilstein-Institut zur Förderung der Chemischen Wissenschaften, Trakehner Straße
          7–9, 60487 Frankfurt am Main, Germany (telephone: +49 (0) 69 71673-20, email:{" "}
          <a href="mailto:info@beilstein-institut.de" className={LEGAL_LINK_CLASS}>
            info@beilstein-institut.de
          </a>
          ). The Beilstein-Institut's data protection officer can be reached at{" "}
          <a href="mailto:datenschutz@beilstein-institut.de" className={LEGAL_LINK_CLASS}>
            datenschutz@beilstein-institut.de
          </a>{" "}
          or via the postal address above with the addition "Der Datenschutzbeauftragte".
        </p>
        <p>
          (3) When you contact us by e-mail, telephone, or mail, the data you provide (e-mail
          address, postal address, name, or telephone number) is stored by us in accordance with
          Art. 6 (1) lit. c GDPR in order to answer your questions. We delete the data accruing in
          this context once storage is no longer necessary. If the request is assigned to a
          contract, we may also initially restrict processing in accordance with the contract terms
          and then delete it. In the case of statutory retention obligations, deletion will only
          take place when they expire.
        </p>
        <p>
          (4) This website is operated on infrastructure of the Beilstein-Institut. No external
          hosting service provider processes your personal data on our behalf.
        </p>
        <p>
          (5) Your personal data is not transferred to third parties within the meaning of Art. 4
          (10) GDPR.
        </p>
      </>
    ),
  },
  {
    id: "website-visit",
    title: "§ 2 Data processing when you visit our website",
    body: (
      <>
        <p>
          (1) When you visit this website, your browser transmits data that is technically necessary
          to display the website and to ensure its stability and security. This includes:
        </p>
        <ul className="ml-5 list-disc space-y-1 marker:text-foreground-muted">
          <li>IP address</li>
          <li>Date and time of the request</li>
          <li>Time-zone difference to GMT</li>
          <li>Content of the request (the specific page)</li>
          <li>Access status / HTTP status code</li>
          <li>Amount of data transferred</li>
          <li>The website the request came from (referrer)</li>
          <li>Browser type and version</li>
          <li>Operating system</li>
          <li>Language settings of the browser software</li>
        </ul>
        <p>
          (2) This data is written to the access logs of our reverse proxy and application server
          for stability and security reasons. The logs are size-capped and rotate automatically —
          the oldest entries are overwritten first — and they are not archived; they are discarded
          entirely when a service is redeployed. Log data whose continued storage is required for
          evidentiary purposes (for example, to investigate a security incident) is retained until
          the incident has been clarified. In addition, a rate limiter inspects the client IP
          address transiently on each request to decide whether to permit or throttle it; this IP is
          discarded at the end of the request and is not written to application tables.
        </p>
        <p>
          (3) The processing is carried out in accordance with Art. 6 (1) lit. f GDPR (legitimate
          interest in delivering a stable, secure service) and, with regard to our IT-security
          obligations, Art. 6 (1) lit. c in conjunction with Art. 32 GDPR.
        </p>
      </>
    ),
  },
  {
    id: "extractions",
    title: "§ 3 Data processing when you extract ChemDraw files",
    body: (
      <>
        <p>
          (1) BChemXtractWeb requires no registration and has no user accounts. Instead, a randomly
          generated anonymous session identifier (a UUID stored in the <code>bcx_sid</code> cookie,
          see § 4) associates your extractions with your browser, so that only you can see your own
          extraction history.
        </p>
        <p>
          (2) When you extract a file via the Extract page, your browser sends the selected ChemDraw
          file (<code>.cdx</code> or <code>.cdxml</code>) to our server. The server parses the file,
          runs structure extraction via the BChemXtract Java library, and persists an extraction
          record to our PostgreSQL database together with the extracted chemical structures. The
          record contains the original file name, file size, format, structure count, processing
          time, and any warnings emitted by the extractor. Extracted structures are deduplicated by
          InChIKey and stored as SMILES, InChI, molecular formula, MDL V3000 block, and rendered
          SVG. These records are retained until you delete them — individually via the{" "}
          <Link to="/history" className={LEGAL_LINK_CLASS}>
            History page
          </Link>
          , or all at once via "Delete all my data" on the{" "}
          <Link to="/settings" className={LEGAL_LINK_CLASS}>
            Settings page
          </Link>{" "}
          (an immediate, permanent deletion). Do not upload files that contain personal data.
        </p>
        <p>
          (3) Security-relevant events (for example session creation, session restore from a
          recovery code, and data deletion) are recorded in an audit log together with a hashed form
          of the session identifier, the IP address, and the browser user agent. Audit-log entries
          are deleted automatically after 12 months.
        </p>
        <p>
          (4) The legal basis for processing your uploads is Art. 6 (1) lit. b GDPR (performance of
          the service you requested); for the audit log it is Art. 6 (1) lit. f GDPR (legitimate
          interest in the security and abuse-resistance of the service).
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "§ 4 Processing of data from your terminal equipment (cookies and browser storage)",
    body: (
      <>
        <p>
          (1) For functions of the website, technical aids — in particular cookies — may be stored
          on your terminal equipment. We use only technically necessary cookies; no optional,
          marketing, or tracking cookies are set, which is why this website shows no consent banner.
        </p>
        <p>
          (2) The single cookie used is set with the <code>HttpOnly</code>, <code>Secure</code>, and{" "}
          <code>SameSite=Lax</code> attributes:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" data-slot="privacy-cookie-table">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Name
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Purpose
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 pr-4 align-top">
                  <code>bcx_sid</code>
                </td>
                <td className="py-2 pr-4 align-top">
                  Anonymous session identifier (random UUID) that associates your extractions and
                  history with your browser
                </td>
                <td className="py-2 align-top">30 days</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          You can configure your browser to refuse or delete cookies at any time; in that case your
          extraction history can no longer be associated with your browser.
        </p>
        <p>(3) In addition, two entries are stored in your browser's local storage:</p>
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
          Both entries remain in your browser, are never sent to the server, and contain no personal
          data. You can clear them at any time through your browser's site-data settings.
        </p>
        <p>
          (4) The storage of and access to this information is carried out in accordance with
          Section 25 (2) of the German Telecommunications-Digital-Services-Data-Protection-Act
          (TDDDG) and Art. 6 (1) lit. f GDPR.
        </p>
      </>
    ),
  },
  {
    id: "analytics",
    title: "§ 5 Web analytics",
    body: (
      <>
        <p>
          (1) BChemXtractWeb does not use any web-analytics service. No usage statistics are
          collected, no advertising or social tracking pixels are loaded, and no third-party content
          is embedded. The JetBrains Mono webfont used by the interface is self-hosted from our own
          origin via the fontsource package.
        </p>
        <p>
          (2) The only outbound requests your browser makes are to this site itself. External links
          (for example on the About and Terms and conditions pages) are plain anchors that you
          follow explicitly.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "§ 6 Your rights",
    body: (
      <>
        <p>(1) You have the following rights with regard to your personal data:</p>
        <ul className="ml-5 list-disc space-y-1 marker:text-foreground-muted">
          <li>Right to information (Art. 15 GDPR)</li>
          <li>Right to rectification of inaccurate data (Art. 16 GDPR)</li>
          <li>
            Right to erasure (Art. 17 GDPR) — extraction records can be deleted by you directly via
            the History page or "Delete all my data" in Settings, or contact us
          </li>
          <li>Right to restriction of processing (Art. 18 GDPR)</li>
          <li>Right to data portability (Art. 20 GDPR)</li>
          <li>Right to object to processing (Art. 21 GDPR)</li>
        </ul>
        <p>
          To exercise any of these rights, contact the controller or the data protection officer at
          the addresses given in § 1.
        </p>
        <p>
          (2) You also have the right to lodge a complaint with a data protection supervisory
          authority if you believe the processing of your personal data infringes the GDPR. The
          authority competent for the Beilstein-Institut is the Hessian Commissioner for Data
          Protection and Freedom of Information (Der Hessische Beauftragte für Datenschutz und
          Informationsfreiheit), Postfach 3163, 65021 Wiesbaden, Germany.
        </p>
      </>
    ),
  },
  {
    id: "objection",
    title: "§ 7 Objection to or revocation of the processing of your data",
    body: (
      <>
        <p>
          (1) We do not currently base any processing on your consent. Should consent-based
          processing be introduced in the future, you may revoke your consent at any time; such a
          revocation affects the permissibility of the processing from that point forward, while
          processing carried out before the revocation remains unaffected.
        </p>
        <p>
          (2) Insofar as we base the processing of your personal data on legitimate interest
          pursuant to Art. 6 (1) lit. f GDPR, you may object to the processing. Upon objection, we
          will review the circumstances and either discontinue or adjust the processing, or
          demonstrate compelling legitimate grounds for its continuation.
        </p>
        <p>(3) You can address an objection at any time using the contact details given in § 1.</p>
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
        title="Privacy policy"
        lede="How BChemXtractWeb handles personal data. This policy describes only what the web application itself does. The Beilstein-Institut publishes a broader privacy policy covering its other activities; see the link at the foot of this page."
      />

      <nav
        aria-label="Privacy policy contents"
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

      <p className="mt-8 text-caption text-foreground-muted" data-slot="privacy-version">
        Version 07.07.2026
      </p>
      <p className="mt-2 text-caption text-foreground-muted">
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
