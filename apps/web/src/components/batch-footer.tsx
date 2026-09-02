import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n';
import type { FileEntry } from '@/lib/types';

type Props = {
  entries: FileEntry[];
  onConfirmAll: () => Promise<void>;
  onDeleteOriginals: () => Promise<void>;
};

export function BatchFooter({
  entries,
  onConfirmAll,
  onDeleteOriginals,
}: Props) {
  const { t } = useLanguage();
  const [alertOpen, setAlertOpen] = useState(false);
  const [parsingWarningOpen, setParsingWarningOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const ready = entries.filter((e) => e.result?.confident).length;
  const needsReview = entries.length - ready;
  const parsingCount = entries.filter((e) => e.status === 'parsing').length;

  const runConfirmAll = async () => {
    setBusy(true);
    try {
      await onConfirmAll();
      setAlertOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAllClick = () => {
    if (parsingCount > 0) {
      setParsingWarningOpen(true);
      return;
    }
    runConfirmAll();
  };

  const handleConfirmAnyway = async () => {
    setParsingWarningOpen(false);
    await runConfirmAll();
  };

  const handleDelete = async () => {
    await onDeleteOriginals();
    setAlertOpen(false);
  };

  return (
    <div className="flex items-center justify-between gap-4 border-t bg-background px-6 py-3">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {t('footerReadyStatus', { ready, needsReview })}
        {parsingCount > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            {t('footerStillScanning', { count: parsingCount })}
          </span>
        )}
      </span>
      <div className="flex gap-2">
        <Button
          onClick={handleConfirmAllClick}
          disabled={busy || entries.length === 0}
        >
          {t('footerConfirmAll')}
        </Button>
      </div>

      <AlertDialog
        open={parsingWarningOpen}
        onOpenChange={setParsingWarningOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('parsingWarningTitle', { count: parsingCount })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('parsingWarningDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('wait')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAnyway}>
              {t('confirmAnyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('deleteOriginalsTitle', { count: entries.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteOriginalsDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('keep')}</AlertDialogCancel>
            <AlertDialogAction autoFocus onClick={handleDelete}>
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
