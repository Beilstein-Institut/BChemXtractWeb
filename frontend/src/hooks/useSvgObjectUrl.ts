import { useEffect, useMemo } from "react";

/**
 * Produce a Blob URL for an SVG string, suitable for `<img src>`.
 *
 * Why not a data URI?
 * `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` triples the
 * payload size (URL-encoding expands non-ASCII to %XX %XX %XX) and some
 * browsers silently refuse `<img src="data:...">` values larger than a few
 * hundred kilobytes. A 586 KB CDK SVG for a large molecule becomes a ~1.5 MB
 * data URI that does not render.
 *
 * A Blob URL is a short reference to the in-memory bytes. No size limit,
 * no per-character encoding overhead, and parsing an SVG inside `<img>`
 * still sandboxes it (no script execution) — same safety guarantee as
 * the data URI it replaces.
 *
 * The URL is revoked when the SVG changes or the component unmounts so
 * we don't leak memory on long-lived pages. Using `useMemo` to derive the
 * URL (rather than `useState` + `useEffect`) avoids a cascading re-render
 * and keeps the computed value in sync with the input without a set-state
 * inside an effect.
 */
export function useSvgObjectUrl(
  svg: string | null | undefined,
): string | null {
  const url = useMemo(() => {
    if (!svg) return null;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    return URL.createObjectURL(blob);
  }, [svg]);

  // Revoke the previous URL on unmount or when `url` changes. Creating a
  // new URL is a side effect on the document's object-URL table; revoking
  // belongs in an effect so the cleanup runs at the right moment in the
  // React lifecycle.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}
