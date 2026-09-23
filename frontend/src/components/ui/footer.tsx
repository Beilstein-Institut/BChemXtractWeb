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
  /** Left column, bottom row (level with the legal links). */
  license?: ReactNode;
}

export interface FooterProps {
  socialLinks: FooterSocialLink[];
  mainLinks: FooterTextLink[];
  legalLinks: FooterTextLink[];
  copyright: FooterCopyright;
  /** Optional centered line along the bottom (brand + copyright holder). */
  bottomLine?: ReactNode;
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
  socialLinks,
  mainLinks,
  legalLinks,
  copyright,
  bottomLine,
  renderLink = defaultRenderLink,
  className,
}: FooterProps) {
  return (
    <footer className={cn("pb-3", className)} aria-labelledby="site-footer-heading">
      <h2 id="site-footer-heading" className="sr-only">
        Site footer
      </h2>
      <div className="px-3 sm:px-4 lg:px-8">
        {/* The hairline is the footer's top edge. Row 1: social icons (left) level
            with the main links (right). Row 2: license line (left) level with
            the legal links (right). lg: 12-col grid, centered line as its own
            last row. 1400px+: three columns (left | centered line | links): the
            outer columns size to their content and the line centers in the
            space between them, spanning both rows and vertically centered in
            the footer, so no extra row is needed and it can never overlap the
            text beside it.
            Below lg everything stacks in reading order. */}
        <div className="border-t border-border pt-3 lg:grid lg:grid-cols-12 wide:grid-cols-[auto_1fr_auto] wide:gap-x-8">
          <ul className="flex list-none space-x-3 lg:col-[1/7] lg:row-[1/2] lg:self-center wide:col-[1]">
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

          {copyright.license && (
            <div className="whitespace-nowrap text-sm leading-6 text-foreground-muted lg:col-[1/7] lg:row-[2/3] lg:mt-0 lg:self-center wide:col-[1]">
              {copyright.license}
            </div>
          )}
          <nav
            aria-label="Footer navigation"
            className="mt-6 lg:col-[7/13] lg:row-[1/2] lg:mt-0 lg:self-end wide:col-[3]"
          >
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
          <div className="mt-1 lg:col-[7/13] lg:row-[2/3] lg:mt-0 lg:self-center wide:col-[3]">
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
          {bottomLine && (
            <div className="mt-3 flex justify-center text-sm text-foreground-muted lg:col-[1/13] lg:row-[3] wide:col-[2] wide:row-[1/3] wide:mt-0 wide:self-center">
              {bottomLine}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
