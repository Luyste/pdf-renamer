import type { FileEntry } from '@org/shared-types';
import { CopyCheck, Loader2, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useLanguage } from '@/lib/i18n';
import { statusColor } from '@/lib/types';

const DOT_CLASS: Record<string, string> = {
  red: 'bg-destructive',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
};

type Props = {
  entry: FileEntry;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onToggleChecked: (checked: boolean) => void;
  onDelete: () => void;
};

export function FileSidebarRow({
  entry,
  isSelected,
  isChecked,
  onSelect,
  onToggleChecked,
  onDelete,
}: Props) {
  const { t } = useLanguage();
  const color = statusColor(entry);
  const parsing = entry.status === 'parsing';

  return (
    <SidebarMenuItem className="group/row">
      <SidebarMenuButton isActive={isSelected} onClick={onSelect}>
        <Checkbox
          checked={isChecked}
          onCheckedChange={(v) => onToggleChecked(v === true)}
          onClick={(e) => e.stopPropagation()}
          aria-label={t('sidebarSelectedCount', { count: 1 })}
        />
        {parsing ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[color]}`}
          />
        )}
        <span className="truncate">{entry.filename || entry.originalName}</span>
        {entry.alreadyProcessed && (
          <span className="ml-auto shrink-0" title={t('alreadyProcessedBadge')}>
            <CopyCheck
              className="h-3.5 w-3.5 text-amber-600"
              aria-label={t('alreadyProcessedBadge')}
            />
          </span>
        )}
        <button
          type="button"
          className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/row:opacity-100"
          title={t('deleteFileTitle')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
