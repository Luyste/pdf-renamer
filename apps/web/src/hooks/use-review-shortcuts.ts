import { useEffect } from 'react';

type Args = {
  selectedId: string | null;
  selectRelative: (delta: number) => void;
  onConfirm: (fileId: string) => void;
  onSkip: (fileId: string) => void;
};

/** ↑/↓/←/→ cycle the file list, Enter confirms, S skips — matches the
 * hints shown in the sidebar header and the Confirm/Skip buttons. */
export function useReviewShortcuts({
  selectedId,
  selectRelative,
  onConfirm,
  onSkip,
}: Args) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = document.activeElement;
      const isEditingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;

      // An open dialog owns the keyboard — otherwise Enter on the "Delete
      // originals?" dialog's focused button confirms the selected file
      // behind it (and preventDefault swallows the button press).
      if (target?.closest('[role="alertdialog"]')) return;

      if (e.key === 'Enter' && !(target instanceof HTMLTextAreaElement)) {
        if (!selectedId) return;
        e.preventDefault();
        onConfirm(selectedId);
        return;
      }

      if (isEditingText) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        selectRelative(1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        selectRelative(-1);
      } else if (e.key.toLowerCase() === 's') {
        if (!selectedId) return;
        e.preventDefault();
        onSkip(selectedId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, selectRelative, onConfirm, onSkip]);
}
