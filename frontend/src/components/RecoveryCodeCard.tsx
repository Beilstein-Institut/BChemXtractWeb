/**
 * RecoveryCodeCard.
 *
 * Renders the raw session UUID as the user's recovery code. The card explains
 * the honest security model: the code IS the credential (same trust level as
 * the cookie). Anyone who has the code can read this session's history.
 *
 * A text+icon "Copy" button writes the code to the clipboard via
 * `navigator.clipboard.writeText`. The icon flips to a check for 2s on
 * success. Clipboard failures fall through silently — the code is still
 * visible on-screen and selectable.
 */
import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { copyText } from "@/lib/clipboard";

export interface RecoveryCodeCardProps {
  /** Session UUID returned by `useAuth()` — null while the hook is loading. */
  sessionId: string | null;
  /** True while `useAuth()` is in-flight; renders a "Loading…" placeholder. */
  isLoading: boolean;
}

export function RecoveryCodeCard({ sessionId, isLoading }: RecoveryCodeCardProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    if (!sessionId) return;
    try {
      await copyText(sessionId);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Even the legacy fallback can fail (e.g. document not focused). The
      // code is visible on-screen — the user can select and copy manually.
    }
  }

  return (
    <Card data-slot="recovery-code-card">
      <CardHeader>
        <CardTitle>Your recovery code</CardTitle>
        <CardDescription>
          Save this code. Pasting it into another browser&rsquo;s &ldquo;Restore from another
          browser&rdquo; form will give that browser access to this session&rsquo;s extraction
          history. Anyone who has this code can read your history &mdash; treat it like a password.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          data-slot="recovery-code-value"
          className="break-all rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-sm text-foreground"
        >
          {isLoading ? "Loading…" : (sessionId ?? "Unavailable")}
        </div>
        <Button
          variant="outline"
          onClick={handleCopy}
          disabled={!sessionId}
          data-slot="recovery-code-copy"
          aria-label={copied ? "Recovery code copied" : "Copy recovery code"}
          className="self-start"
        >
          {copied ? (
            <CheckIcon className="size-4" aria-hidden="true" />
          ) : (
            <CopyIcon className="size-4" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </CardContent>
    </Card>
  );
}
