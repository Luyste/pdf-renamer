import { Loader2, Plus } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useLanguage } from '@/lib/i18n';
import { type FileEntry, sortEntries, statusColor } from '@/lib/types';

const DOT_CLASS: Record<string, string> = {
  red: 'bg-destructive',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
};

type Props = {
  entries: FileEntry[];
  selectedId: string | null;
  onSelect: (fileId: string) => void;
  onFiles: (files: File[]) => void;
};

export function FileSidebar({ entries, selectedId, onSelect, onFiles }: Props) {
  const { t } = useLanguage();
  const sorted = sortEntries(entries);
  const parsingCount = entries.filter((e) => e.status === 'parsing').length;
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
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="h-auto flex-wrap justify-between gap-y-1 py-1">
            <span className="flex-1">
              {t('sidebarInvoices', { count: entries.length })}
              {parsingCount > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('sidebarScanning', { count: parsingCount })}
                </span>
              )}
            </span>
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <kbd className="rounded border px-1 py-0.5 text-[10px]">↑</kbd>
              <kbd className="rounded border px-1 py-0.5 text-[10px]">↓</kbd>
              <span className="ml-0.5">{t('sidebarNavigate')}</span>
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sorted.map((entry) => {
                const color = statusColor(entry);
                const parsing = entry.status === 'parsing';
                return (
                  <SidebarMenuItem key={entry.fileId}>
                    <SidebarMenuButton
                      isActive={entry.fileId === selectedId}
                      onClick={() => onSelect(entry.fileId)}
                    >
                      {parsing ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[color]}`}
                        />
                      )}
                      <span className="truncate">
                        {entry.filename || entry.originalName}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <div className="p-2">
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
    </Sidebar>
  );
}
