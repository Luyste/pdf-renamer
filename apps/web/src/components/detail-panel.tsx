import type { Field } from '@org/shared-types';
import {
  AlertTriangle,
  Check,
  CopyCheck,
  Loader2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n';
import type { FileEntry } from '@/lib/types';

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.5;

type Props = {
  entry: FileEntry;
  onFilenameChange: (fileId: string, filename: string) => void;
  onConfirm: (fileId: string) => void;
  onSkip: (fileId: string) => void;
};

function FieldRow({ label, field }: { label: string; field: Field }) {
  return (
    <div className="flex items-start gap-2 py-1">
      {field.ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="truncate text-sm">
          {field.value ?? (field.raw || '—')}
        </div>
      </div>
    </div>
  );
}

export function DetailPanel({
  entry,
  onFilenameChange,
  onConfirm,
  onSkip,
}: Props) {
  const { t } = useLanguage();
  const filenameInputId = useId();
  const result = entry.result;
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  useEffect(() => {
    setZoom(ZOOM_MIN);
    setPan({ x: 0, y: 0 });
  }, [entry.fileId]);

  const zoomOut = () =>
    setZoom((z) => {
      const next = Math.max(ZOOM_MIN, z - ZOOM_STEP);
      if (next === ZOOM_MIN) setPan({ x: 0, y: 0 });
      return next;
    });
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= ZOOM_MIN) return;
    setIsPanning(true);
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  };
  const handlePointerUp = () => setIsPanning(false);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-full max-w-3xl shrink-0 flex-col gap-4 overflow-y-auto border-r p-6">
        <div>
          <h2 className="text-lg font-semibold">{entry.originalName}</h2>
        </div>

        {entry.alreadyProcessed && (
          <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <CopyCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t('alreadyProcessedMessage', {
                filename: entry.alreadyProcessed.filename,
                date: new Date(
                  entry.alreadyProcessed.downloadedAt,
                ).toLocaleDateString(),
              })}
            </span>
          </div>
        )}

        {result ? (
          <div className="space-y-1 rounded border p-3">
            <FieldRow label={t('fieldInvoice')} field={result.invoice} />
            <FieldRow label={t('fieldFulfilDate')} field={result.fulfil_date} />
            <FieldRow label={t('fieldCustomer')} field={result.customer} />
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('detailScanning')}
          </p>
        )}

        {result && result.problems.length > 0 && (
          <ul className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {result.problems.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}

        <div>
          <label
            htmlFor={filenameInputId}
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            {t('detailFilenameLabel')}
          </label>
          <Input
            id={filenameInputId}
            value={entry.filename}
            onChange={(e) => onFilenameChange(entry.fileId, e.target.value)}
            placeholder={t('detailFilenamePlaceholder')}
            className="font-mono text-sm"
          />
        </div>

        <div className="mt-auto flex gap-2 pt-4">
          <Button
            onClick={() => onConfirm(entry.fileId)}
            disabled={entry.status === 'confirmed'}
          >
            {t('detailConfirm')}
            <kbd className="ml-2 rounded border border-primary-foreground/30 px-1 py-0.5 text-[10px] opacity-70">
              Enter
            </kbd>
          </Button>
          <Button
            variant="outline"
            onClick={() => onSkip(entry.fileId)}
            disabled={entry.status === 'skipped'}
          >
            {t('detailSkip')}
            <kbd className="ml-2 rounded border px-1 py-0.5 text-[10px] opacity-70">
              S
            </kbd>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-muted/30">
        {result?.thumb ? (
          <>
            <div className="flex items-center justify-end gap-1 border-b bg-background p-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={zoomOut}
                disabled={zoom <= ZOOM_MIN}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={zoomIn}
                disabled={zoom >= ZOOM_MAX}
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            <div
              className="relative min-h-0 flex-1 select-none overflow-hidden"
              style={{
                cursor:
                  zoom > ZOOM_MIN
                    ? isPanning
                      ? 'grabbing'
                      : 'grab'
                    : 'default',
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <img
                src={`data:image/png;base64,${result.thumb}`}
                alt={`Preview of ${entry.originalName}`}
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
                className="h-full w-full object-contain p-4"
              />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('detailRenderingPreview')}
          </div>
        )}
      </div>
    </div>
  );
}
