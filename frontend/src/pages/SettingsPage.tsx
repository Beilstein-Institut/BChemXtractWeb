/**
 * SettingsPage — Phase 11 D-07 user-facing privacy controls.
 *
 * Three sections, top to bottom:
 *   1. Recovery code (RecoveryCodeCard) — the session UUID + copy button.
 *   2. Restore from another browser (RestoreSessionForm) — paste UUID + submit.
 *   3. Delete all my data (DeleteMyDataButton, inside its own warning Card).
 *
 * `useAuth()` is called locally so the recovery code stays in sync with
 * the cookie even after the user restores from another browser (which
 * changes session_id under us — useAuth refetches via PUT /api/auth/me).
 * The hook is also called at App root in App.tsx — React's batching plus
 * the hook's idempotent fetch make the double-call harmless and the local
 * hook gives this page a typed `error` channel for the bootstrap path.
 */
import { DeleteMyDataButton } from "@/components/DeleteMyDataButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { RecoveryCodeCard } from "@/components/RecoveryCodeCard";
import { RestoreSessionForm } from "@/components/RestoreSessionForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export function SettingsPage() {
  const { sessionId, isLoading, error } = useAuth();

  return (
    <PageContainer data-slot="settings-page">
      <header className="space-y-2">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Settings
        </h1>
        <p className="text-base text-foreground-muted">
          Your session, recovery code, and data privacy controls.
        </p>
      </header>

      {error !== null && (
        <p role="alert" data-slot="settings-error" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="mt-8 grid gap-6" data-slot="settings-sections">
        <RecoveryCodeCard sessionId={sessionId} isLoading={isLoading} />
        <RestoreSessionForm />
        <Card data-slot="delete-my-data-card">
          <CardHeader>
            <CardTitle>Delete all my data</CardTitle>
            <CardDescription>
              GDPR Article 17 &mdash; permanently erase every extraction, substance, and reaction
              created from this session. Cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteMyDataButton />
          </CardContent>
        </Card>
      </section>
    </PageContainer>
  );
}
