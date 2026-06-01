import React from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Generic confirmation dialog for destructive delete actions.
 *
 * Props:
 *   open        – boolean controlling visibility
 *   onCancel    – called when user cancels
 *   onConfirm   – called when user confirms deletion
 *   title       – dialog heading  (default: "Delete this item?")
 *   description – supporting text (default: "This action cannot be undone.")
 */
export default function ConfirmDeleteDialog({ open, onCancel, onConfirm, title, description }) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title || 'Delete this item?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {description || 'This action cannot be undone. Are you sure you want to delete this?'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}