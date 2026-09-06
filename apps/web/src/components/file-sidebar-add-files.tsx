import { Plus } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { useLanguage } from '@/lib/i18n';

type Props = {
  onFiles: (files: File[]) => void;
};

export function FileSidebarAddFiles({ onFiles }: Props) {
  const { t } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const inputId = useId();

  const handleFileList = useCallback(
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
    <div className="px-2 pb-2">
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
          handleFileList(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed p-3 text-xs text-muted-foreground transition-colors ${
          dragging ? 'border-primary bg-accent' : 'border-border'
        }`}
      >
        <Plus className="h-3.5 w-3.5" />
        {t('sidebarAddFiles')}
        <input
          id={inputId}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFileList(e.target.files)}
        />
      </label>
    </div>
  );
}
