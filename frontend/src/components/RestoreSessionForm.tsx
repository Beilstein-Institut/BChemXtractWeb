/**
 * RestoreSessionForm — Phase 11 D-09 cookie-swap restore.
 *
 * The user pastes a recovery code (UUID4 from another browser's Settings
 * page) and submits. We:
 *   1. Trim + lowercase the input, then validate against the canonical
 *      UUID4 regex (mirrors backend `_UUID_RE` shape in auth.py). Invalid
 *      shapes are rejected client-side without a roundtrip.
 *   2. POST `{code}` to `/api/auth/restore`. On 204 the backend has issued
 *      `Set-Cookie: bcx_sid=<code>`.
 *   3. Full reload — every component rehydrates from the new cookie,
 *      avoiding partial state where History sees the new session but
 *      something else still holds the old session_id. No data merge per
 *      D-09; the previous session's extractions remain attached to the
 *      previous UUID but are no longer reachable from this browser until
 *      the user restores back.
 *
 * The 403/CSRF_INVALID retry path lives in apiClient — we don't surface
 * it here. apiFetch refetches the CSRF token + retries once before this
 * component sees an error.
 */
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postAuthRestore } from "@/lib/apiClient";

/**
 * Canonical UUID4: 8-4-4-4-12 hex with version nibble `4` at position 13
 * and variant bits `8|9|a|b` at position 17. Lowercase only — the backend
 * regex is identical (see backend/app/routers/auth.py `_UUID_RE`). The
 * input is trimmed + lowercased before this match runs so visually-valid
 * codes the user pasted in mixed case still pass.
 */
const UUID4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function RestoreSessionForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmed = code.trim().toLowerCase();
    if (!UUID4_RE.test(trimmed)) {
      setError(
        "Recovery code must be a valid UUID4 (e.g. 11111111-1111-4111-8111-111111111111).",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await postAuthRestore(trimmed);
      // Cookie has been swapped — reload so every component rehydrates
      // from the new session. Cheaper and more correct than threading the
      // change through React state because Browse + History + the Auth
      // hook all need the new identity simultaneously.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
      setIsSubmitting(false);
    }
  }

  return (
    <Card data-slot="restore-session-form">
      <CardHeader>
        <CardTitle>Restore from another browser</CardTitle>
        <CardDescription>
          Paste the recovery code from another browser to load that
          session&rsquo;s extraction history here. This REPLACES your current
          session &mdash; any data uploaded from this browser without
          restoring this code back will become unreachable until you do.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="recovery-code-input">Recovery code (UUID4)</Label>
            <Input
              id="recovery-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000"
              disabled={isSubmitting}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-slot="restore-code-input"
            />
          </div>
          {error !== null && (
            <p
              role="alert"
              data-slot="restore-session-error"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            data-slot="restore-submit"
            className="self-start"
          >
            {isSubmitting ? "Restoring…" : "Restore session"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
