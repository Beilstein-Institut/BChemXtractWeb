import { useEffect, useState } from "react";

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
 * Create + revoke both live in the same effect: an earlier version derived
 * the URL with `useMemo` and only revoked in an effect, but StrictMode's
 * dev double-mount then revoked the memoized URL on the simulated unmount
 * and never recreated it (memo survives the remount), leaving `<img>`
 * pointing at a dead blob. Pairing create/revoke per effect run makes the
 * URL valid by construction under any mount/unmount sequence, at the cost
 * of one extra render on mount.
 */
export function useSvgObjectUrl(svg: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = svg
      ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
      : null;
    // The URL is an external resource that must be created (and revoked)
    // inside the effect; publishing its handle via state is the
    // StrictMode-safe pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [svg]);

  return url;
}
