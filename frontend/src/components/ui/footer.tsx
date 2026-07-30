import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface FooterSocialLink {
  icon: ReactNode;
  href: string;
  label: string;
}

export interface FooterTextLink {
  href: string;
  label: string;
  /** When true, the link is handled by the app router; otherwise it opens normally. */
  internal?: boolean;
}

export interface FooterCopyright {
  text: ReactNode;
  license?: ReactNode;
}

export interface FooterProps {
  /**
   * Brand mark rendered on the left of the top row. Omit (together with
   * `brandName`) to drop the branding entirely and push the social row
   * to the right on its own line.
   */
  logo?: ReactNode;
  /**
   * Brand wordmark displayed next to the logo. Accepts plain text or a
   * composed node (e.g. a styled wordmark component). `brandLabel`
   * supplies the aria-label when brandName is not a simple string.
   */
  brandName?: ReactNode;
  /**
   * Accessible name for the home-link anchor. Falls back to `brandName`
   * when that prop is a string; otherwise required for screen readers.
   */
  brandLabel?: string;
  socialLinks: FooterSocialLink[];
  mainLinks: FooterTextLink[];
  legalLinks: FooterTextLink[];
  copyright: FooterCopyright;
  /** Renderer for internal links (main + legal). Defaults to a plain anchor. */
  renderLink?: (link: FooterTextLink, className: string) => ReactNode;
  className?: string;
}

function defaultRenderLink(link: FooterTextLink, className: string): ReactNode {
  return (
    <a href={link.href} className={className}>
      {link.label}
    </a>
  );
}

export function Footer({
  logo,
  brandName,
  brandLabel,
  socialLinks,
  mainLinks,
  legalLinks,
  copyright,
  renderLink = defaultRenderLink,
  className,
}: FooterProps) {
  const ariaLabel = brandLabel ?? (typeof brandName === "string" ? brandName : undefined);
  return (
    <footer
      className={cn("pb-6 pt-16 lg:pb-8 lg:pt-24", className)}
      aria-labelledby="site-footer-heading"
    >
      <h2 id="site-footer-heading" className="sr-only">
        Site footer
      </h2>
      <div className="px-3 sm:px-4 lg:px-8">
        <div
          className={cn(
            "md:flex md:items-start",
            logo || brandName ? "md:justify-between" : "md:justify-end",
          )}
        >
          {(logo || brandName) && (
            <a
              href="/"
              className="flex items-center gap-x-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
              aria-label={ariaLabel}
            >
              {logo}
              {brandName &&
                (typeof brandName === "string" ? (
                  <span className="font-display text-xl font-bold tracking-tight">{brandName}</span>
                ) : (
                  brandName
                ))}
            </a>
          )}
          <ul className={cn("flex list-none space-x-3", (logo || brandName) && "mt-6 md:mt-0")}>
            {socialLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-full",
                    "border border-border bg-surface-elevated text-foreground-muted",
                    "transition-colors duration-200",
                    "hover:bg-accent hover:text-primary hover:border-primary/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-5",
                  )}
                >
                  {link.icon}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6 border-t border-border pt-6 md:mt-4 md:pt-8 lg:grid lg:grid-cols-12">
          <div
            className={cn(
              "text-sm leading-6 text-foreground-muted",
              "lg:col-[1/4] lg:row-[1/3] lg:mt-0",
            )}
          >
            <div className="whitespace-nowrap">{copyright.text}</div>
            {copyright.license && <div className="whitespace-nowrap">{copyright.license}</div>}
          </div>
          <nav aria-label="Footer navigation" className="mt-6 lg:col-[9/13] lg:row-[1/2] lg:mt-0">
            <ul className="-my-1 -mx-2 flex list-none flex-wrap justify-end">
              {mainLinks.map((link) => (
                <li key={link.href} className="my-1 mx-2 shrink-0">
                  {renderLink(
                    link,
                    "text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline",
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-1 lg:col-[9/13] lg:row-[2/3] lg:mt-0">
            <ul className="-my-1 -mx-3 flex list-none flex-wrap justify-end">
              {legalLinks.map((link) => (
                <li key={link.href} className="my-1 mx-3 shrink-0">
                  {renderLink(
                    link,
                    "text-sm text-foreground-muted underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline",
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
