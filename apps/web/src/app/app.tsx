import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { BatchFooter } from '@/components/batch-footer';
import { DetailPanel } from '@/components/detail-panel';
import { FileSidebar } from '@/components/file-sidebar';
import { LanguageToggle } from '@/components/language-toggle';
import { SidebarProvider } from '@/components/ui/sidebar';
import { UploadZone } from '@/components/upload-zone';
import { useBatch } from '@/hooks/use-batch';
import { useReviewShortcuts } from '@/hooks/use-review-shortcuts';
import { fetchHealth } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';

export function App() {
  const { t } = useLanguage();
  const [ocrFallbackLang, setOcrFallbackLang] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((h) => {
        if (h.ocr_lang !== 'hun+eng') setOcrFallbackLang(h.ocr_lang);
      })
      .catch(() => {});
  }, []);

  const {
    entryList,
    selected,
    selectedId,
    setSelectedId,
    handleFiles,
    handleFilenameChange,
    handleConfirm,
    handleSkip,
    handleDeleteFile,
    handleDeleteFiles,
    selectRelative,
    handleConfirmAll,
    handleDeleteOriginals,
    handleCancelBatch,
    handleBatchComplete,
  } = useBatch(t);

  useReviewShortcuts({
    selectedId,
    selectRelative,
    onConfirm: handleConfirm,
    onSkip: handleSkip,
  });

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
            onDeleteFile={handleDeleteFile}
            onDeleteFiles={handleDeleteFiles}
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
              onCancelBatch={handleCancelBatch}
              onBatchComplete={handleBatchComplete}
            />
          </div>
        </SidebarProvider>
      )}
    </div>
  );
}

export default App;
