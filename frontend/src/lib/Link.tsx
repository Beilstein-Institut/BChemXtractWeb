/**
 * <Link> — anchor that navigates via the lightweight pathname router
 * (src/lib/router.ts). Respects modifier keys so cmd/ctrl/shift clicks
 * still open in new tab / window normally.
 */
import {
  useCallback,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";
import { navigate } from "@/lib/router";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
};

export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (onClick) onClick(e);
      if (e.defaultPrevented) return;
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      e.preventDefault();
      navigate(to);
    },
    [onClick, to],
  );

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
