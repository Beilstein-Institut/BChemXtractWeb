/**
 * DeferredCommandPalette — bundle-size optimization wrapper.
 *
 * The real <CommandPalette /> imports motion/react plus a large icon
 * set (~40-50 kB of initial bundle). Most sessions never open it.
 *
 * This wrapper installs the same ⌘K / Ctrl+K keyboard listener that
 * the palette would, but defers the palette's own mount (and therefore
 * its code chunk download + parse) until the user actually triggers
 * it. The first keystroke is a one-time chunk fetch; every subsequent
 * open is instant.
 *
 * Hand-off to the real palette:
 *   - On first ⌘K, we set activated=true and stop listening. React.lazy
 *     triggers the dynamic import; <Suspense fallback={null}> renders
 *     nothing while the chunk loads.
 *   - Once loaded, <CommandPalette initiallyOpen /> mounts already
 *     open, so the user's first ⌘K both loads AND opens the palette.
 *   - The palette owns its own ⌘K / Esc handlers from there on.
 *
 * The keyboard contract (⌘K / Ctrl+K toggles; Esc closes) is preserved
 * exactly — DevTools, Playwright, and a11y tests see no difference.
 */

import { Suspense, lazy, useEffect, useState } from "react";

const CommandPalette = lazy(() =>
  import("./CommandPalette").then((mod) => ({ default: mod.CommandPalette })),
);

function isActivator(e: KeyboardEvent): boolean {
  // Match CommandPalette's useKeyboardShortcut semantics: Cmd (mac) or
  // Ctrl (other) plus the `k` key, no other modifiers required. We
  // don't gate on shift/alt because the palette itself doesn't.
  const meta = e.metaKey || e.ctrlKey;
  return meta && (e.key === "k" || e.key === "K");
}

export function DeferredCommandPalette() {
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (activated) return;
    function onKey(e: KeyboardEvent) {
      if (!isActivator(e)) return;
      e.preventDefault();
      setActivated(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activated]);

  if (!activated) return null;

  // Null fallback by design: the palette is a modal overlay; a spinner
  // behind it would be disorienting. First-open latency is capped at
  // one chunk fetch which is fast on modern networks.
  return (
    <Suspense fallback={null}>
      <CommandPalette initiallyOpen />
    </Suspense>
  );
}
