import type { FileEntry } from '@org/shared-types';
import { Loader2 } from 'lucide-react';
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
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';
import { useLanguage } from '@/lib/i18n';
import { sortEntries } from '@/lib/types';
import { FileSidebarAddFiles } from './file-sidebar-add-files';
import { FileSidebarRow } from './file-sidebar-row';
import { FileSidebarSelectionBar } from './file-sidebar-selection-bar';

type Props = {
  entries: FileEntry[];
  selectedId: string | null;
  onSelect: (fileId: string) => void;
  onFiles: (files: File[]) => void;
  onDeleteFiles: (fileIds: string[]) => void;
};

export function FileSidebar({
  entries,
  selectedId,
  onSelect,
  onFiles,
  onDeleteFiles,
}: Props) {
  const { t } = useLanguage();
  const sorted = sortEntries(entries);
  const parsingCount = entries.filter((e) => e.status === 'parsing').length;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const toggleChecked = (fileId: string, isChecked: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (isChecked) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  };

  const confirmBulkDelete = () => {
    onDeleteFiles([...checked]);
    setChecked(new Set());
    setBulkDeleteOpen(false);
  };

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

          <FileSidebarAddFiles onFiles={onFiles} />

          <FileSidebarSelectionBar
            count={checked.size}
            onClear={() => setChecked(new Set())}
            onDelete={() => setBulkDeleteOpen(true)}
          />

          <SidebarGroupContent>
            <SidebarMenu>
              {sorted.map((entry) => (
                <FileSidebarRow
                  key={entry.fileId}
                  entry={entry}
                  isSelected={entry.fileId === selectedId}
                  isChecked={checked.has(entry.fileId)}
                  onSelect={() => onSelect(entry.fileId)}
                  onToggleChecked={(v) => toggleChecked(entry.fileId, v)}
                  onDelete={() => onDeleteFiles([entry.fileId])}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('deleteFilesTitle', { count: checked.size })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteFilesDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('sidebarClearSelection')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete}>
              {t('sidebarDeleteSelected')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
