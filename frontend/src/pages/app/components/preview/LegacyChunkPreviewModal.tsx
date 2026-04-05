import {cn} from '../../../../shared/lib/utils';
import type {Chunk, Document} from '../../../../shared/types';

type LegacyChunkPreviewModalProps = {
  open: boolean;
  isDarkTheme: boolean;
  language: 'zh' | 'en';
  locale: {
    previewTitle: string;
    previewMetaSize: string;
    previewMetaType: string;
    previewMetaChunks: string;
    previewNoChunks: string;
    previewMoreChunks: string;
    openDetails: string;
    close: string;
  };
  document: Document | null;
  chunks: Chunk[];
  onClose: () => void;
  onOpenDetails: (doc: Document) => void;
};

export function LegacyChunkPreviewModal({
  open,
  isDarkTheme,
  language,
  locale,
  document,
  chunks,
  onClose,
  onOpenDetails,
}: LegacyChunkPreviewModalProps) {
  if (!open || !document) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        data-testid="legacy-preview-modal-surface"
        className={cn(
          'flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl',
          isDarkTheme ? 'border border-slate-700 bg-slate-900' : 'bg-white',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={cn('flex shrink-0 items-center justify-between border-b p-4', isDarkTheme ? 'border-slate-700' : 'border-gray-200')}>
          <h3 className={cn('font-bold', isDarkTheme ? 'text-slate-100' : 'text-gray-800')}>
            {locale.previewTitle} - {document.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={cn('rounded p-1', isDarkTheme ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100')}
            aria-label={locale.close}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className={cn('mb-4 flex gap-4 text-sm', isDarkTheme ? 'text-slate-300' : 'text-gray-500')}>
            <span>{locale.previewMetaSize}: {(document.size / 1024 / 1024).toFixed(2)} MB</span>
            <span>{locale.previewMetaType}: {document.type}</span>
            <span>{locale.previewMetaChunks}: {chunks.length}</span>
          </div>

          <div className="space-y-3">
            {chunks.length > 0
              ? chunks.slice(0, 5).map((chunk, index) => (
                <div key={`${chunk.id || 'legacy-chunk'}-${index}`} className={cn('rounded-lg border p-3', isDarkTheme ? 'border-slate-700 bg-slate-800/70' : 'border-gray-200 bg-gray-50/50')}>
                  <span className={cn('rounded px-2 py-0.5 text-xs font-bold', isDarkTheme ? 'bg-sky-900/50 text-sky-200' : 'bg-blue-100 text-blue-600')}>
                    #{(chunk.index || 0) + 1}
                  </span>
                  <p className={cn('mt-2 line-clamp-3 text-sm leading-relaxed', isDarkTheme ? 'text-slate-100' : 'text-gray-600')}>
                    {chunk.content}
                  </p>
                </div>
              ))
              : (
                <p className={cn('py-6 text-center', isDarkTheme ? 'text-slate-400' : 'text-gray-400')}>
                  {locale.previewNoChunks}
                </p>
              )}

            {chunks.length > 5 ? (
              <p className={cn('text-center text-sm', isDarkTheme ? 'text-slate-400' : 'text-gray-400')}>
                {language === 'en'
                  ? `${chunks.length - 5} ${locale.previewMoreChunks}`
                  : `还有 ${chunks.length - 5} ${locale.previewMoreChunks}`}
              </p>
            ) : null}
          </div>
        </div>

        <div className={cn('flex shrink-0 justify-end gap-2 border-t p-4', isDarkTheme ? 'border-slate-700' : 'border-gray-200')}>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenDetails(document);
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {locale.openDetails}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn('rounded-lg px-4 py-2 text-sm font-medium transition-colors', isDarkTheme ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 hover:bg-gray-200')}
          >
            {locale.close}
          </button>
        </div>
      </div>
    </div>
  );
}
