/**
 * <Link> — anchor that navigates via the lightweight pathname router
 * (src/lib/router.ts). Respects modifier keys so cmd/ctrl/shift clicks
 * still open in new tab / window normally.
 */
import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { withBase } from "@/lib/basePath";
import { navigate } from "@/lib/router";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
};

/** Return true when the browser should handle the click natively
 *  (new tab/window, middle-click, prevented by a parent handler). */
function shouldBypass(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

export function Link({ to, onClick, children, ...rest }: LinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (shouldBypass(e)) return;
    e.preventDefault();
    navigate(to);
  }

  return (
    // `to` is root-relative; withBase keeps cmd/middle-click (which bypasses
    // the click handler and uses the raw href) inside the deployment sub-path.
    <a href={withBase(to)} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
