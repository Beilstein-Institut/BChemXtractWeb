import { Coffee, Globe } from "lucide-react";

import { BrandName } from "@/components/BrandName";
import { Footer, type FooterTextLink } from "@/components/ui/footer";
import { Link } from "@/lib/Link";

/**
 * Inline GitHub Octocat mark — lucide-react 1.8.0 doesn't ship a Github
 * export (trademark trimming), so we fall back to the official single-path
 * silhouette. 24×24 viewBox, currentColor fill to inherit surrounding ink.
 */
function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.3 1.2-3.1-.12-.3-.52-1.5.1-3.13 0 0 .98-.31 3.21 1.18.93-.26 1.93-.4 2.92-.4s1.99.14 2.92.4c2.23-1.5 3.21-1.18 3.21-1.18.62 1.63.22 2.83.1 3.13.75.8 1.2 1.84 1.2 3.1 0 4.43-2.7 5.4-5.28 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

/**
 * Project-specific footer composition.
 *
 * Wraps the generic <Footer /> primitive with BChemXtract branding:
 *   - No top-row brand mark (design choice — the AppHeader carries the logo)
 *   - Social: BChemXtractWeb GitHub + Beilstein-Institut website
 *   - Main links: Extract / Browse / History / About — routed through
 *     the internal <Link /> so clicks stay inside the SPA
 *   - Legal: License / Imprint / Privacy — all internal pages
 *   - Copyright: © 2026 <BrandName /> · Open source
 *   - Centered band: "Built with [animated ☕] at the Beilstein-Institut"
 */

/**
 * Renders "Open source" with the resolved BChemXtract version appended when
 * VITE_BCHEMXTRACT_VERSION is baked into the bundle. The version links to the
 * matching GitHub release page. When the env var is empty (e.g. local
 * `npm run dev` outside docker), only "Open source" is shown — no broken link.
 *
 * Hovering the version reveals the rest of the chemistry stack (CDK 2.12,
 * Java 21) on desktop. Quiet, engineer-to-engineer easter egg; mobile users
 * get the bare version since hover doesn't exist there.
 */
function LicenseLine() {
  const version = import.meta.env.VITE_BCHEMXTRACT_VERSION?.trim();
  if (!version) {
    return <>Open source</>;
  }
  const releaseUrl = `https://github.com/Beilstein-Institut/BChemXtract/releases/tag/${encodeURIComponent(version)}`;
  return (
    <span className="group/version inline-flex items-baseline">
      Open source · running{" "}
      <a
        href={releaseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-1 text-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        BChemXtract {version}
      </a>
      <span
        aria-hidden="true"
        className="ml-1 hidden text-foreground-muted opacity-0 transition-opacity duration-200 group-hover/version:opacity-100 sm:inline"
      >
        · CDK 2.12 · Java 21
      </span>
    </span>
  );
}

function SteamingCoffee() {
  return (
    <span className="coffee-steam relative inline-flex items-center" aria-hidden="true">
      <span className="coffee-steam__puff coffee-steam__puff--1" />
      <span className="coffee-steam__puff coffee-steam__puff--2" />
      <Coffee className="size-4 text-primary" />
    </span>
  );
}

function renderInternalLink(link: FooterTextLink, className: string): React.ReactNode {
  if (link.internal) {
    return (
      <Link to={link.href} className={className}>
        {link.label}
      </Link>
    );
  }
  return (
    <a
      href={link.href}
      target={link.href.startsWith("http") ? "_blank" : undefined}
      rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
      className={className}
    >
      {link.label}
    </a>
  );
}

export function SiteFooter() {
  return (
    <Footer
      renderLink={renderInternalLink}
      socialLinks={[
        {
          icon: <GithubIcon />,
          href: "https://github.com/Beilstein-Institut/BChemXtractWeb",
          label: "BChemXtractWeb on GitHub",
        },
        {
          icon: <Globe />,
          href: "https://www.beilstein-institut.de/en/",
          label: "Beilstein-Institut website",
        },
      ]}
      mainLinks={[
        { href: "/", label: "Extract", internal: true },
        { href: "/browse", label: "Browse", internal: true },
        { href: "/history", label: "History", internal: true },
        { href: "/about", label: "About", internal: true },
      ]}
      legalLinks={[
        { href: "/license", label: "License", internal: true },
        { href: "/imprint", label: "Imprint", internal: true },
        { href: "/privacy", label: "Privacy", internal: true },
      ]}
      copyright={{
        text: (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <img
              src="/bchemxtract-logo.svg"
              alt=""
              aria-hidden="true"
              className="h-5 w-5 shrink-0"
            />
            <span>
              © 2026 <BrandName />
            </span>
          </span>
        ),
        license: <LicenseLine />,
      }}
      middleSlot={
        <span className="inline-flex items-center gap-2">
          <span>Built with</span>
          <SteamingCoffee />
          <span>
            at the{" "}
            <a
              href="https://www.beilstein-institut.de/en/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              Beilstein-Institut
            </a>
          </span>
        </span>
      }
    />
  );
}
