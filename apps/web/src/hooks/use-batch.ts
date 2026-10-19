import type {
  BatchState,
  ConfirmItem,
  FileEntry,
  ParseResult,
} from '@org/shared-types';
import { MAX_BATCH_SIZE } from '@org/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  clearActiveBatchId,
  loadActiveBatchId,
  saveActiveBatchId,
} from '@/lib/active-batch';
import {
  deleteBatch,
  deleteFile,
  downloadBatch,
  subscribeToParse,
  uploadFiles,
} from '@/lib/api';
import type { TranslationKey } from '@/lib/i18n';
import { useBatchState } from '@/lib/queries';
import { sortEntries } from '@/lib/types';

/** All batch data + mutations, backed by a TanStack Query cache of the
 * server's GET /api/batch/:id state. Keeps app.tsx to layout/wiring. */
export function useBatch(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
) {
  const queryClient = useQueryClient();
  const [batchId, setBatchId] = useState<string | null>(loadActiveBatchId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hasResumedParsing = useRef(false);

  const batchQuery = useBatchState(batchId);

  const patchEntries = useCallback(
    (updater: (entries: FileEntry[]) => FileEntry[]) => {
      if (!batchId) return;
      queryClient.setQueryData<BatchState>(['batch', batchId], (old) =>
        old ? { ...old, entries: updater(old.entries) } : old,
      );
    },
    [batchId, queryClient],
  );

  // Takes the batch id explicitly instead of going through patchEntries: SSE
  // callbacks outlive the render that started them, and for a brand-new
  // batch that render's batchId is still null, so results were dropped and
  // the files sat on "parsing" until a reload.
  const applyParseResult = useCallback(
    (forBatchId: string, r: ParseResult & { fileId: string }) => {
      queryClient.setQueryData<BatchState>(['batch', forBatchId], (old) =>
        old
          ? {
              ...old,
              entries: old.entries.map((e) =>
                e.fileId === r.fileId
                  ? {
                      ...e,
                      status: 'parsed',
                      result: r,
                      filename: r.filename ?? '',
                    }
                  : e,
              ),
            }
          : old,
      );
    },
    [queryClient],
  );

  // Resume any parses that were still in flight when the page was reloaded.
  useEffect(() => {
    if (hasResumedParsing.current || !batchQuery.data) return;
    hasResumedParsing.current = true;
    const resumeBatchId = batchQuery.data.batchId;
    const pending = batchQuery.data.entries.filter(
      (e) => e.status === 'parsing',
    );
    if (pending.length === 0) return;

    subscribeToParse(
      resumeBatchId,
      pending.map((e) => e.fileId),
      (r) => applyParseResult(resumeBatchId, r),
      () => {},
    );
  }, [batchQuery.data, applyParseResult]);

  const entryList = useMemo(
    () => sortEntries(batchQuery.data?.entries ?? []),
    [batchQuery.data],
  );

  // Keep a selection whenever entries exist — arrow-key cycling needs a
  // starting point, and this also handles hydration from a saved session.
  useEffect(() => {
    if (selectedId && entryList.some((e) => e.fileId === selectedId)) return;
    if (entryList.length > 0) setSelectedId(entryList[0].fileId);
  }, [entryList, selectedId]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const currentCount = batchQuery.data?.entries.length ?? 0;
      const remaining = MAX_BATCH_SIZE - currentCount;
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
      if (!batchId) {
        // Seed an empty batch so the query starts with data and never
        // fetches: a GET racing the upload would see half the files,
        // duplicate their entries and start a second parse for them.
        queryClient.setQueryData<BatchState>(['batch', activeBatchId], {
          batchId: activeBatchId,
          entries: [],
        });
        setBatchId(activeBatchId);
        saveActiveBatchId(activeBatchId);
      }

      const total = toUpload.length;
      const toastId = toast.loading(t('uploadProgress', { done: 0, total }));
      const uploadedIds: string[] = [];
      try {
        await uploadFiles(activeBatchId, toUpload, (u) => {
          uploadedIds.push(u.fileId);
          // Each file shows up as soon as it lands, so a long upload
          // visibly moves instead of looking frozen.
          const entry: FileEntry = {
            fileId: u.fileId,
            originalName: u.originalName,
            status: 'parsing',
            result: null,
            filename: '',
            alreadyProcessed: u.alreadyProcessed,
          };
          queryClient.setQueryData<BatchState>(
            ['batch', activeBatchId],
            (old) => ({
              batchId: activeBatchId,
              entries: [...(old?.entries ?? []), entry],
            }),
          );
          toast.loading(
            t('uploadProgress', { done: uploadedIds.length, total }),
            { id: toastId },
          );
        });
      } finally {
        toast.dismiss(toastId);
        // Parse whatever made it up, even if a later file failed.
        if (uploadedIds.length > 0) {
          subscribeToParse(
            activeBatchId,
            uploadedIds,
            (r) => applyParseResult(activeBatchId, r),
            () => {},
          );
        }
      }
    },
    [batchId, batchQuery.data, queryClient, applyParseResult, t],
  );

  const handleFilenameChange = useCallback(
    (fileId: string, filename: string) => {
      patchEntries((entries) =>
        entries.map((e) => (e.fileId === fileId ? { ...e, filename } : e)),
      );
    },
    [patchEntries],
  );

  const advanceSelection = useCallback(
    (fromId: string) => {
      const idx = entryList.findIndex((e) => e.fileId === fromId);
      const next = entryList
        .slice(idx + 1)
        .find((e) => e.status !== 'confirmed' && e.status !== 'skipped');
      setSelectedId(next ? next.fileId : null);
    },
    [entryList],
  );

  const handleConfirm = useCallback(
    (fileId: string) => {
      patchEntries((entries) =>
        entries.map((e) =>
          e.fileId === fileId ? { ...e, status: 'confirmed' } : e,
        ),
      );
      advanceSelection(fileId);
    },
    [advanceSelection, patchEntries],
  );

  const handleSkip = useCallback(
    (fileId: string) => {
      patchEntries((entries) =>
        entries.map((e) =>
          e.fileId === fileId ? { ...e, status: 'skipped' } : e,
        ),
      );
      advanceSelection(fileId);
    },
    [advanceSelection, patchEntries],
  );

  const handleDeleteFiles = useCallback(
    async (fileIds: string[]) => {
      if (!batchId || fileIds.length === 0) return;
      await Promise.all(fileIds.map((id) => deleteFile(batchId, id)));
      const removed = new Set(fileIds);
      patchEntries((entries) => entries.filter((e) => !removed.has(e.fileId)));
      if (selectedId && removed.has(selectedId)) setSelectedId(null);
      toast.success(
        fileIds.length === 1
          ? t('toastFileDeleted')
          : t('toastFilesDeleted', { count: fileIds.length }),
      );
    },
    [batchId, patchEntries, selectedId, t],
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

  const handleConfirmAll = useCallback(async () => {
    if (!batchId) return;
    const entries = batchQuery.data?.entries ?? [];
    const items: ConfirmItem[] = entries.map((e) => ({
      token: e.fileId,
      original: e.originalName,
      filename: e.filename || null,
      skip: e.status === 'skipped',
    }));
    const blob = await downloadBatch(batchId, items);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${batchId}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking right after click() can cancel the download (Safari, Firefox)
    // before the browser has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.success(t('toastDownloadStarted'));
  }, [batchId, batchQuery.data, t]);

  const handleDeleteOriginals = useCallback(async () => {
    if (!batchId) return;
    await deleteBatch(batchId);
    toast.success(t('toastOriginalsDeleted'));
  }, [batchId, t]);

  const handleBatchComplete = useCallback(() => {
    if (batchId) queryClient.removeQueries({ queryKey: ['batch', batchId] });
    setBatchId(null);
    setSelectedId(null);
    clearActiveBatchId();
  }, [batchId, queryClient]);

  const handleCancelBatch = useCallback(async () => {
    if (!batchId) return;
    await deleteBatch(batchId);
    toast.success(t('toastBatchCancelled'));
    handleBatchComplete();
  }, [batchId, t, handleBatchComplete]);

  const selected = selectedId
    ? (entryList.find((e) => e.fileId === selectedId) ?? null)
    : null;

  return {
    entryList,
    selected,
    selectedId,
    setSelectedId,
    handleFiles,
    handleFilenameChange,
    handleConfirm,
    handleSkip,
    handleDeleteFiles,
    selectRelative,
    handleConfirmAll,
    handleDeleteOriginals,
    handleCancelBatch,
    handleBatchComplete,
  };
}
