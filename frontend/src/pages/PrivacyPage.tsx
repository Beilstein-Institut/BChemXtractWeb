/**
 * PrivacyPage — GDPR privacy policy for BChemXtractWeb.
 *
 * Text and section order follow the institute's supplied document
 * ("Privacy Policy BChemXtract 2026.docx", version 07.07.2026) word for
 * word: § 1 collection · § 2 website visit · § 3 cookies · § 4 your rights
 * · § 5 objection.
 *
 * Nothing is added to that text — the rights holder asked for its wording
 * to stay identical across all its sites, so it can be maintained in one
 * place. Do not reintroduce site-specific paragraphs here (earlier
 * revisions carried a no-external-hosting statement, a no-web-analytics
 * statement, GDPR article numbers, the supervisory authority's postal
 * address, a page lede, a table of contents, a sourcing note linking the
 * institute's full policy, a § 2(2) paragraph describing log rotation
 * mechanics, a § 3 paragraph describing extraction-record storage and
 * deletion, a § 3 paragraph stating the GDPR basis for uploads and the
 * audit log, and a § 3 paragraph citing Section 25 (2) TDDDG; all were
 * removed on request).
 *
 * The departures that remain exist because the document would otherwise be
 * false about this application: § 2 discloses the audit log, and § 3
 * replaces "we do not use Cookies or similar technical aids" with what this
 * app actually does — the bcx_sid session cookie and browser storage. A
 * privacy policy that understates processing is worse than none. This is
 * reported to the rights holder for their master document.
 *
 * The controller's postcode is 60487, as in the Impressum — the privacy
 * document says 60486, which is a typo for Trakehner Str. 7-9. Telephone
 * and street are likewise spelled as on the Impressum page so the same
 * address does not appear two ways on one site.
 *
 * What this app does, in code (the policy no longer covers uploads):
 *   - No user accounts. An anonymous session UUID in the `bcx_sid`
 *     cookie (backend/app/core/session.py: 30 days, HttpOnly, Secure,
 *     SameSite=Lax) scopes extraction history via Postgres RLS.
 *   - Uploads persist an extraction record + structures in PostgreSQL
 *     (backend/app/models/orm.py), deletable by the user from the
 *     History page or wholesale via Settings → Delete all my data
 *     (backend/app/routers/me.py — immediate hard delete).
 *   - Security-relevant events land in audit_log with hashed session
 *     id, raw IP, and user agent (backend/app/services/audit.py); pruned
 *     daily after AUDIT_LOG_RETENTION_DAYS, default 14
 *     (backend/app/tasks/audit_log.py). If that default is raised, § 2(3)
 *     below must be edited to match.
 *   - Rate limiter inspects the client IP transiently
 *     (backend/app/middleware/rate_limit.py) — never persisted on
 *     application rows.
 *   - Access logs (nginx + Uvicorn) go to the container log stream,
 *     size-capped (docker-compose.yml x-logging) and pruned to a 14-day
 *     window by scripts/prune-container-logs.sh on a host cron — that
 *     cron is what makes § 2(2)'s "within 2 weeks" true.
 *   - Browser storage: localStorage "bchemxtract-theme",
 *     sessionStorage "bcx.reactions.experimentalBannerDismissed".
 *   - No web analytics, no third-party embeds, fonts self-hosted.
 */
import { ShieldCheckIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { asset } from "@/lib/basePath";
import { LEGAL_LINK_CLASS, LegalPageHeader } from "@/pages/legalShared";

const INSTITUTE_URL = "https://www.beilstein-institut.de/en/";

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
          (1) In the following, we inform you about the processing of personal data when using this
          website and our services as well as about further processing procedures by us. Personal
          data are all data that can be related to you personally, such as name, address, e-mail
          address or user behavior.
        </p>
        <p>
          (2) The responsible party pursuant to Art. 4 (7) of the General Data Protection Regulation
          (GDPR) is the
        </p>
        <p>
          Beilstein-Institut zur Förderung der Chemischen Wissenschaften,
          <br />
          Trakehner Str. 7-9
          <br />
          60487 Frankfurt am Main
          <br />
          Germany
          <br />
          <br />
          Telephone: +49 69 716732-0
          <br />
          Email:{" "}
          <a href="mailto:info@beilstein-institut.de" className={LEGAL_LINK_CLASS}>
            info@beilstein-institut.de
          </a>
          <br />
          Website:{" "}
          <a
            href="https://www.beilstein-institut.de"
            target="_blank"
            rel="noreferrer"
            className={LEGAL_LINK_CLASS}
          >
            https://www.beilstein-institut.de
          </a>
        </p>
        <p>
          You can reach our data protection officer at{" "}
          <a href="mailto:datenschutz@beilstein-institut.de" className={LEGAL_LINK_CLASS}>
            datenschutz@beilstein-institut.de
          </a>{" "}
          or at our postal address with the addition "Der Datenschutzbeauftragte".
        </p>
        <p>
          (3) When you contact us by e-mail, telephone or mail, the data you provide (e-mail
          address, postal address, name or telephone number) will be stored by us in accordance with
          Art. 6 (1) lit. c GDPR in order to answer your questions.
        </p>
        <p>
          We delete the data accruing in this context after the storage is no longer necessary. If
          the request is assigned to a contract, we may also initially restrict processing in
          accordance with the contract terms and then delete it. In the case of statutory retention
          obligations, deletion will only take place when they expire.
        </p>
        <p>(4) No data is transferred to third parties in the sense of Art. 4 (10) GDPR.</p>
      </>
    ),
  },
  {
    id: "website-visit",
    title: "§ 2 Data processing when you visit and use our website",
    body: (
      <>
        <p>
          (1) When you visit our website without otherwise providing us with information, we process
          the personal data that your browser transmits to our server. The data described below is
          technically necessary for us to display our website to you and to ensure stability and
          security and must therefore be processed by us:
        </p>
        <ul className="ml-5 list-disc space-y-1 marker:text-foreground-muted">
          <li>IP address</li>
          <li>Date and time of the request</li>
          <li>Time zone difference to Greenwich Mean Time (GMT)</li>
          <li>Content of the request (specific page)</li>
          <li>Access status/HTTP status code (e.g. file found, file not found)</li>
          <li>Amount of data transferred in each case</li>
          <li>Website from which the request came to us</li>
          <li>Browser</li>
          <li>Operating system and its interface</li>
          <li>Language and version of the browser software.</li>
        </ul>
        <p>
          (2) We use this data collected and stored in log files for stability and security reasons
          and delete them within 2 weeks. Data that require further storage for evidentiary purposes
          are exempt from deletion until the respective incident has been finally clarified. The
          collection of data for the provision of the website and the storage of the data in log
          files is absolutely necessary for the operation of the website. Therefore, the user has no
          right to object. Insofar as you use the functions of our website, the processing of the
          data required for this is also carried out in accordance with Art. 6 (1) lit. b GDPR in
          order to provide the services you request from us.
        </p>
        <p>
          (3) Security-relevant events (for example session creation, session restore from a
          recovery code, and data deletion) are recorded in an audit log together with a hashed form
          of the session identifier, the IP address, and the browser user agent. Audit-log entries
          are deleted automatically after two weeks.
        </p>
        <p>
          (4) Data processing is carried out on the basis of our legal obligation to guarantee IT
          security in accordance with Art. 6 (1) lit. c in conjunction with Art. 32 GDPR and in
          accordance with Art. 6 (1) lit. f GDPR, as otherwise we would not be able to provide our
          offered services in a functional manner. Your visit to our website is based on your
          autonomous decision. This wish can only be fulfilled by means of the described data
          processing.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "§ 3 Cookies",
    body: (
      <>
        <p>
          (1) BChemXtractWeb requires no registration and has no user accounts. Instead, a randomly
          generated anonymous session identifier (a UUID stored in the <code>bcx_sid</code> cookie,
          see (2) below) associates your extractions with your browser, so that only you can see
          your own extraction history.
        </p>
        <p>
          (2) For functions of the website, technical aids — in particular cookies — may be stored
          on your terminal equipment. We use only technically necessary cookies; no optional,
          marketing, or tracking cookies are set, which is why this website shows no consent banner.
          The single cookie used is set with the <code>HttpOnly</code>, <code>Secure</code>, and{" "}
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
      </>
    ),
  },
  {
    id: "rights",
    title: "§ 4 Your rights",
    body: (
      <>
        <p>(1) You have the following rights with regard to the personal data concerning you:</p>
        <ul className="ml-5 list-disc space-y-1 marker:text-foreground-muted">
          <li>right to information,</li>
          <li>right to correction or deletion,</li>
          <li>right to restriction of processing,</li>
          <li>right to object to processing,</li>
          <li>right to data portability.</li>
        </ul>
        <p>
          (2) You also have the right to complain to the competent data protection supervisory
          authority about the processing of your personal data by us, for example the Hessian
          Commissioner for Data Protection and Freedom of Information.
        </p>
      </>
    ),
  },
  {
    id: "objection",
    title: "§ 5 Objection to or revocation of the processing of your data",
    body: (
      <>
        <p>
          (1) Insofar as we base the processing of your personal data on the legal basis of the
          exercise of a legitimate interest pursuant to Art. 6 (1) lit. f GDPR, you may object to
          the processing. This is the case if the processing is not necessary, in particular, for
          the fulfillment of a contract with you. When exercising such an objection, we ask you to
          explain the reasons why we should not process your personal data in the way we have done.
          In the event of your objection, we will review the situation and either discontinue or
          adjust the data processing or show you our compelling legitimate grounds on the basis of
          which we will continue the processing.
        </p>
        <p>
          (2) Of course, you can object to the processing of your personal data for data analysis
          purposes at any time.
        </p>
      </>
    ),
  },
];

export function PrivacyPage() {
  return (
    <PageContainer data-slot="privacy-page">
      {/* Title block left, the institute's mark right — the mark links to the
          institute's site, as it does in the source document. Transparent
          artwork; white plate in dark mode only, because the wordmark is dark
          navy and must not be recoloured. */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <LegalPageHeader
          icon={<ShieldCheckIcon aria-hidden="true" className="size-3.5" />}
          eyebrow="Privacy"
          title="Privacy Policy"
        />
        <a
          href={INSTITUTE_URL}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 self-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={asset("beilstein-institut-logo-wide.png")}
            alt="Beilstein-Institut"
            width={507}
            height={120}
            className="h-16 w-auto max-w-full p-3 dark:rounded-md dark:bg-white sm:h-24"
          />
        </a>
      </div>

      <div className="mt-10 flex flex-col gap-8">
        {TOPICS.map((t) => (
          <section
            key={t.id}
            id={t.id}
            aria-labelledby={`${t.id}-heading`}
            className="scroll-mt-[calc(var(--header-height)_+_3rem)] rounded-lg border border-border bg-surface p-6 sm:p-8"
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
    </PageContainer>
  );
}
