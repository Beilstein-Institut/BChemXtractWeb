/**
 * DeleteConfirmDialog — AlertDialog for destructive extraction deletion (D-07).
 * UI-SPEC: AlertDialog (not Dialog), "Delete extraction?" title, outline cancel,
 * destructive confirm. Max 400px wide.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteConfirmDialogProps {
  open: boolean;
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive confirmation dialog. Renders AlertDialog (role="alertdialog"). */
export function DeleteConfirmDialog({
  open,
  filename,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[17px] font-semibold">
            Delete extraction?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[14px] text-muted-foreground">
            This will remove &ldquo;{filename}&rdquo; from your history. Structures shared with
            other extractions are kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep extraction</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete extraction
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
