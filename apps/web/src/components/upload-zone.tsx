import { useCallback, useId, useState } from 'react';
import { useLanguage } from '@/lib/i18n';

type Props = {
  onFiles: (files: File[]) => void;
};

export function UploadZone({ onFiles }: Props) {
  const { t } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const inputId = useId();

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const pdfs = Array.from(list).filter(
        (f) =>
          f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      );
      if (pdfs.length) onFiles(pdfs);
    },
    [onFiles],
  );

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex h-64 w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-center transition-colors ${
          dragging ? 'border-primary bg-accent' : 'border-border'
        }`}
      >
        <p className="text-lg font-medium">{t('uploadDropHint')}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('uploadClickHint')}
        </p>
        <input
          id={inputId}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>
    </div>
  );
}
