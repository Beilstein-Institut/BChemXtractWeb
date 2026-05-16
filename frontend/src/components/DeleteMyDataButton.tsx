/**
 * DeleteMyDataButton — Phase 11 D-14 GDPR Article 17.
 *
 * Trigger button → AlertDialog confirmation → DELETE /api/me/data. On success
 * the backend has cascaded the delete + cleared the `bcx_sid` cookie; we full
 * reload so the page returns to a fresh-session empty state (useAuth() then
 * mints a new cookie via PUT /api/auth/me on the next render).
 *
 * Uses Base UI's AlertDialog primitive (mirror of `BatchProgress` cancel
 * dialog pattern): the trigger renders a destructive Button via `render={…}`,
 * and confirmation lives in `AlertDialogAction.onClick`. We keep an internal
 * `open` state so we can hold the dialog open while the network call is in
 * flight and surface errors inline without unmounting.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteMyData } from "@/lib/apiClient";

export function DeleteMyDataButton() {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteMyData();
      // Backend has cleared the cookie + nuked our rows. Reload so the
      // entire app rehydrates from a fresh session — empty history,
      // empty browse, brand new session_id on the Settings page.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setIsDeleting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    // Block dismissal while the network call is mid-flight so the user
    // can't double-tap or escape and end up in a partial state.
    if (isDeleting && !next) return;
    setOpen(next);
    if (!next) setError(null);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={
          <Button
            variant="destructive"
            data-slot="delete-my-data-trigger"
          />
        }
      >
        Delete all my data
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[480px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete all your data?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently erases every extraction tied to your session,
            including any substances or reactions only your uploads created.
            This cannot be undone. Saved recovery codes for this session will
            no longer work.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null && (
          <p
            role="alert"
            data-slot="delete-my-data-error"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Keep data</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
            data-slot="delete-my-data-confirm"
          >
            {isDeleting ? "Deleting…" : "Delete everything"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
