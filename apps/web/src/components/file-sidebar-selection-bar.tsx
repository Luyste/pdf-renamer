import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n';

type Props = {
  count: number;
  onClear: () => void;
  onDelete: () => void;
};

export function FileSidebarSelectionBar({ count, onClear, onDelete }: Props) {
  const { t } = useLanguage();
  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between gap-2 px-2 pb-2 text-xs">
      <span className="text-muted-foreground">
        {t('sidebarSelectedCount', { count })}
      </span>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onClear}
        >
          <X className="h-3 w-3" />
          {t('sidebarClearSelection')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
          {t('sidebarDeleteSelected')}
        </Button>
      </div>
    </div>
  );
}
