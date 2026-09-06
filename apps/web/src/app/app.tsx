import { type ConfirmItem, MAX_BATCH_SIZE } from '@org/shared-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { BatchFooter } from '@/components/batch-footer';
import { DetailPanel } from '@/components/detail-panel';
import { FileSidebar } from '@/components/file-sidebar';
import { LanguageToggle } from '@/components/language-toggle';
import { SidebarProvider } from '@/components/ui/sidebar';
import { UploadZone } from '@/components/upload-zone';
import {
  confirmBatch,
  deleteBatch,
  downloadBatch,
  fetchHealth,
  subscribeToParse,
  uploadFiles,
} from '@/lib/api';
import { useLanguage } from '@/lib/i18n';
import { clearSession, loadSession, saveSession } from '@/lib/session-storage';
import { type FileEntry, sortEntries } from '@/lib/types';

export function App() {
  const { t } = useLanguage();
  const initialSession = useRef(loadSession()).current;
  const [batchId, setBatchId] = useState<string | null>(
    initialSession?.batchId ?? null,
  );
  const [entries, setEntries] = useState<Record<string, FileEntry>>(
    initialSession?.entries ?? {},
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ocrFallbackLang, setOcrFallbackLang] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((h) => {
        if (h.ocr_lang !== 'hun+eng') setOcrFallbackLang(h.ocr_lang);
      })
      .catch(() => {});
  }, []);

  // Resume any parses that were still in flight when the page was reloaded.
  useEffect(() => {
    if (!initialSession) return;
    const pending = Object.values(initialSession.entries).filter(
      (e) => e.status === 'parsing',
    );
    if (pending.length === 0) return;

    subscribeToParse(
      initialSession.batchId,
      pending.map((e) => e.fileId),
      (r) => {
        setEntries((prev) => {
          const existing = prev[r.fileId];
          if (!existing) return prev;
          return {
            ...prev,
            [r.fileId]: {
              ...existing,
              status: 'parsed',
              result: r,
              filename: r.filename ?? '',
            },
          };
        });
      },
      () => {},
    );
  }, []);

  useEffect(() => {
    if (!batchId) {
      clearSession();
      return;
    }
    saveSession({ batchId, entries });
  }, [batchId, entries]);

  const entryList = useMemo(
    () => sortEntries(Object.values(entries)),
    [entries],
  );

  // Keep a selection whenever entries exist — arrow-key cycling needs a
  // starting point, and this also handles hydration from a saved session.
  useEffect(() => {
    if (selectedId && entries[selectedId]) return;
    if (entryList.length > 0) setSelectedId(entryList[0].fileId);
  }, [entryList, selectedId, entries]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const remaining = MAX_BATCH_SIZE - Object.keys(entries).length;
      if (remaining <= 0) {
        toast.error(t('batchLimitReached', { max: MAX_BATCH_SIZE }));
        return;
      }
      const toUpload = files.slice(0, remaining);
      if (files.length > toUpload.length) {
        toast.warning(
          t('batchLimitTruncated', {
            max: MAX_BATCH_SIZE,
            accepted: toUpload.length,
            skipped: files.length - toUpload.length,
          }),
        );
      }

      const activeBatchId = batchId ?? crypto.randomUUID();
      if (!batchId) setBatchId(activeBatchId);
      const uploaded = await uploadFiles(activeBatchId, toUpload);

      setEntries((prev) => {
        const next = { ...prev };
        for (const u of uploaded) {
          next[u.fileId] = {
            fileId: u.fileId,
            originalName: u.originalName,
            status: 'parsing',
            result: null,
            filename: '',
            alreadyProcessed: u.alreadyProcessed,
          };
        }
        return next;
      });

      subscribeToParse(
        activeBatchId,
        uploaded.map((u) => u.fileId),
        (r) => {
          setEntries((prev) => {
            const existing = prev[r.fileId];
            if (!existing) return prev;
            return {
              ...prev,
              [r.fileId]: {
                ...existing,
                status: 'parsed',
                result: r,
                filename: r.filename ?? '',
              },
            };
          });
        },
        () => {},
      );
    },
    [batchId, entries, t],
  );

  const handleFilenameChange = useCallback(
    (fileId: string, filename: string) => {
      setEntries((prev) => ({
        ...prev,
        [fileId]: { ...prev[fileId], filename },
      }));
    },
    [],
  );

  const advanceSelection = useCallback(
    (fromId: string) => {
      const sorted = sortEntries(Object.values(entries));
      const idx = sorted.findIndex((e) => e.fileId === fromId);
      const next = sorted
        .slice(idx + 1)
        .find((e) => e.status !== 'confirmed' && e.status !== 'skipped');
      setSelectedId(next ? next.fileId : null);
    },
    [entries],
  );

  const handleConfirm = useCallback(
    (fileId: string) => {
      setEntries((prev) => ({
        ...prev,
        [fileId]: { ...prev[fileId], status: 'confirmed' },
      }));
      advanceSelection(fileId);
    },
    [advanceSelection],
  );

  const handleSkip = useCallback(
    (fileId: string) => {
      setEntries((prev) => ({
        ...prev,
        [fileId]: { ...prev[fileId], status: 'skipped' },
      }));
      advanceSelection(fileId);
    },
    [advanceSelection],
  );

  const selectRelative = useCallback(
    (delta: number) => {
      if (entryList.length === 0) return;
      const idx = entryList.findIndex((e) => e.fileId === selectedId);
      const nextIdx =
        idx === -1 ? 0 : (idx + delta + entryList.length) % entryList.length;
      setSelectedId(entryList[nextIdx].fileId);
    },
    [entryList, selectedId],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = document.activeElement;
      const isEditingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;

      if (e.key === 'Enter' && !(target instanceof HTMLTextAreaElement)) {
        if (!selectedId) return;
        e.preventDefault();
        handleConfirm(selectedId);
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
        handleSkip(selectedId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, selectRelative, handleConfirm, handleSkip]);

  const handleConfirmAll = useCallback(async () => {
    if (!batchId) return;
    const items: ConfirmItem[] = Object.values(entries).map((e) => ({
      token: e.fileId,
      original: e.originalName,
      filename: e.filename || null,
      skip: e.status === 'skipped',
    }));
    await confirmBatch(batchId, items);

    const blob = await downloadBatch(batchId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${batchId}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    clearSession();
    toast.success(t('toastDownloadStarted'));
  }, [batchId, entries, t]);

  const handleDeleteOriginals = useCallback(async () => {
    if (!batchId) return;
    await deleteBatch(batchId);
    clearSession();
    toast.success(t('toastOriginalsDeleted'));
  }, [batchId, t]);

  const handleBatchComplete = useCallback(() => {
    setBatchId(null);
    setEntries({});
    setSelectedId(null);
    clearSession();
  }, []);

  const selected = selectedId ? entries[selectedId] : null;

  return (
    <div className="flex h-screen flex-col">
      <Toaster />
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-semibold">{t('appTitle')}</span>
        <LanguageToggle />
      </div>
      {ocrFallbackLang && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          {t('ocrWarning', { lang: ocrFallbackLang })}
        </div>
      )}

      {entryList.length === 0 ? (
        <UploadZone onFiles={handleFiles} />
      ) : (
        <SidebarProvider className="flex min-h-0 flex-1">
          <FileSidebar
            entries={entryList}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onFiles={handleFiles}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              {selected ? (
                <DetailPanel
                  entry={selected}
                  onFilenameChange={handleFilenameChange}
                  onConfirm={handleConfirm}
                  onSkip={handleSkip}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t('detailSelectFile')}
                </div>
              )}
            </div>
            <BatchFooter
              entries={entryList}
              onConfirmAll={handleConfirmAll}
              onDeleteOriginals={handleDeleteOriginals}
              onBatchComplete={handleBatchComplete}
            />
          </div>
        </SidebarProvider>
      )}
    </div>
  );
}

export default App;
