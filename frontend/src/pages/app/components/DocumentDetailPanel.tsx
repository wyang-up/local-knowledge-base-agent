import {format} from 'date-fns';
import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ChevronDown, Clock, FileSpreadsheet, MoreHorizontal, Settings} from 'lucide-react';
import {cn} from '../../../shared/lib/utils';
import type {Chunk, Document} from '../../../shared/types';

type DocumentDetailLocale = {
  backToDocs: string;
  detailParsed: string;
  previewMetaChunks: string;
  detailDescriptionLabel: string;
  detailDescriptionPlaceholder: string;
  detailOutlineTitle: string;
  detailNoOutline: string;
  detailSectionPrefix: string;
  detailChunkTitle: string;
  detailChunkHint: string;
  detailChunkTag: string;
  detailExpand: string;
  tabSettings: string;
};

type DocumentDetailPanelProps = {
  isDarkTheme: boolean;
  locale: DocumentDetailLocale;
  details: Document & {chunks: Chunk[]};
  highlightedChunkId?: string | null;
  highlightedChunkIndex?: number | null;
  onSaveDescription: (description: string) => void;
  onBack: () => void;
  onOpenSettings: () => void;
};

export function DocumentDetailPanel({
  isDarkTheme,
  locale,
  details,
  highlightedChunkId = null,
  highlightedChunkIndex = null,
  onSaveDescription,
  onBack,
  onOpenSettings,
}: DocumentDetailPanelProps) {
  const highlightedRef = useRef<HTMLDivElement | null>(null);
  const [focusedChunkId, setFocusedChunkId] = useState<string | null>(highlightedChunkId);
  const [descriptionDraft, setDescriptionDraft] = useState(details.description || '');

  useEffect(() => {
    setDescriptionDraft(details.description || '');
  }, [details.id, details.description]);

  useEffect(() => {
    if (highlightedChunkId) {
      setFocusedChunkId(highlightedChunkId);
      return;
    }
    if (highlightedChunkIndex !== null && highlightedChunkIndex !== undefined) {
      const target = details.chunks?.find((chunk) => chunk.index === highlightedChunkIndex);
      setFocusedChunkId(target?.id ?? null);
    }
  }, [highlightedChunkId, highlightedChunkIndex, details.chunks]);

  useEffect(() => {
    if (highlightedRef.current) {
      highlightedRef.current.scrollIntoView?.({behavior: 'smooth', block: 'center'});
    }
  }, [focusedChunkId, details.id]);

  const handleDescriptionBlur = () => {
    const normalized = descriptionDraft.trim();
    if (normalized === (details.description || '').trim()) return;
    onSaveDescription(normalized);
  };

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${isDarkTheme ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <div className={`h-14 border-b flex items-center justify-between px-6 shrink-0 ${isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
        <button
          type="button"
          onClick={onBack}
          className={`flex items-center gap-2 transition-colors font-medium text-sm ${isDarkTheme ? 'text-slate-300 hover:text-sky-300' : 'text-gray-600 hover:text-blue-600'}`}
        >
          <ArrowLeft size={18} /> {locale.backToDocs}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={`p-2 rounded-full transition-colors ${isDarkTheme ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
          aria-label={locale.tabSettings}
        >
          <Settings size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div className="max-w-5xl w-full flex flex-col gap-6">
          <div className={cn('p-6 rounded-xl shadow-sm border flex flex-col gap-4 relative', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200')}>
            <button type="button" className={cn('absolute top-4 right-4', isDarkTheme ? 'text-slate-400 hover:text-sky-300' : 'text-gray-400 hover:text-blue-600')}><MoreHorizontal size={20}/></button>
            <div className="flex items-start gap-4">
              <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center shrink-0', isDarkTheme ? 'bg-slate-800 text-sky-300' : 'bg-blue-50 text-blue-600')}>
                <FileSpreadsheet size={24} />
              </div>
              <div>
                <h2 className={cn('text-xl font-bold mb-1', isDarkTheme ? 'text-slate-100' : 'text-gray-800')}>{details.name}</h2>
                <div className={cn('flex items-center gap-4 text-sm', isDarkTheme ? 'text-slate-300' : 'text-gray-500')}>
                  <span>{(details.size / 1024 / 1024).toFixed(2)} MB</span>
                  <span>{details.type}</span>
                  <span className="flex items-center gap-1"><Clock size={14}/> {details.uploadTime ? format(new Date(details.uploadTime), 'yyyy-MM-dd HH:mm') : '-'}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                    {locale.detailParsed} ({details.chunkCount} {locale.previewMetaChunks})
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label className={cn('block text-xs font-semibold uppercase mb-1', isDarkTheme ? 'text-slate-300' : 'text-gray-500')}>{locale.detailDescriptionLabel}</label>
              <textarea
                className={cn('w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none resize-none transition-colors', isDarkTheme ? 'border-slate-700 text-slate-100 bg-slate-800 hover:bg-slate-700' : 'border-gray-200 text-gray-700 bg-gray-50 hover:bg-white')}
                rows={2}
                placeholder={locale.detailDescriptionPlaceholder}
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={handleDescriptionBlur}
              ></textarea>
            </div>
          </div>

          <div className="flex gap-6 flex-1 min-h-0">
            <div className={cn('w-1/3 rounded-xl shadow-sm border p-5 flex flex-col', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200')}>
              <h3 className={cn('font-bold mb-4 pb-2 border-b', isDarkTheme ? 'text-slate-100 border-slate-700' : 'text-gray-800 border-gray-100')}>{locale.detailOutlineTitle}</h3>
              <div className="flex-1 overflow-auto space-y-1">
                {details.chunks?.length > 0 ? (
                  details.chunks.slice(0, 10).map((_, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setFocusedChunkId(details.chunks[idx]?.id ?? null)}
                      className={cn('w-full text-left text-sm p-2 pl-6 rounded cursor-pointer transition-colors', isDarkTheme ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-50')}
                    >
                      {locale.detailSectionPrefix} {idx + 1}
                    </button>
                  ))
                ) : (
                  <div className={cn('text-sm p-2', isDarkTheme ? 'text-slate-400' : 'text-gray-400')}>{locale.detailNoOutline}</div>
                )}
              </div>
            </div>

            <div className={cn('w-2/3 rounded-xl shadow-sm border p-5 flex flex-col', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200')}>
              <h3 className={cn('font-bold mb-4 pb-2 border-b', isDarkTheme ? 'text-slate-100 border-slate-700' : 'text-gray-800 border-gray-100')}>{locale.detailChunkTitle} <span className={cn('text-xs font-normal ml-2', isDarkTheme ? 'text-slate-300' : 'text-gray-500')}>{locale.detailChunkHint}</span></h3>
              <div className="flex-1 overflow-auto space-y-3 pr-2">
                {details.chunks?.map((chunk) => {
                  const isHighlighted = focusedChunkId === chunk.id;

                  return (
                  <div
                    key={chunk.id}
                    ref={isHighlighted ? highlightedRef : null}
                    data-testid={`detail-chunk-${chunk.id}`}
                    className={cn(
                      'border rounded-lg p-4 hover:shadow-sm transition-all group',
                      isDarkTheme ? 'border-slate-700 bg-slate-800/60 hover:border-sky-400' : 'border-gray-200 bg-gray-50/50 hover:border-blue-300',
                      isHighlighted && (isDarkTheme ? 'ring-2 ring-sky-300 border-sky-400' : 'ring-2 ring-blue-300 border-blue-400 bg-blue-50/70'),
                    )}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={cn('text-xs font-bold px-2 py-0.5 rounded', isDarkTheme ? 'text-sky-200 bg-sky-900/50' : 'text-blue-600 bg-blue-100')}>{locale.detailChunkTag} #{(chunk.index || 0) + 1}</span>
                      <button type="button" className={cn('text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity', isDarkTheme ? 'text-slate-300 hover:text-sky-300' : 'text-gray-400 hover:text-blue-600')}>
                        {locale.detailExpand} <ChevronDown size={12}/>
                      </button>
                    </div>
                    <p className={cn('text-sm leading-relaxed line-clamp-2', isDarkTheme ? 'text-slate-100' : 'text-gray-700')}>{chunk.content}</p>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
