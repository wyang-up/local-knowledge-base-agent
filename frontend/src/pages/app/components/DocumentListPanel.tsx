import {useEffect, useRef, useState} from 'react';
import {format} from 'date-fns';
import {CheckCircle2, CircleX, Eye, File, FileSpreadsheet, Folder, Loader2, Trash2, UploadCloud} from 'lucide-react';
import {cn} from '../../../shared/lib/utils';
import type {Chunk, Document, MessageSource} from '../../../shared/types';
import {DocumentPreviewContent} from './preview/DocumentPreviewContent';
import {LegacyChunkPreviewModal} from './preview/LegacyChunkPreviewModal';
import {PreviewModal} from './preview/PreviewModal';
import {buildSourceHighlightRequestKey, normalizeSourceHighlightTarget} from './preview/source-highlight-target';
import {useDocumentPreviewResource} from './preview/useDocumentPreviewResource';

export type DocumentListLocale = {
  uploadDoc: string;
  uploadFeatureHint: string;
  uploadHint: string;
  uploadSupport: string;
  colName: string;
  colSize: string;
  colType: string;
  colUploadTime: string;
  colStatus: string;
  colActions: string;
  statusProcessing: string;
  statusCompleted: string;
  statusFailed: string;
  previewAction: string;
  detailAction: string;
  deleteAction: string;
  retryAction: string;
  noDocuments: string;
  previewTitle: string;
  previewMetaSize: string;
  previewMetaType: string;
  previewMetaChunks: string;
  previewNoChunks: string;
  previewMoreChunks: string;
  openDetails: string;
  close: string;
  previewLocateChunk: string;
  previewDownloadAction: string;
  previewCloseAriaLabel: string;
  previewLoadError: string;
  previewLoading: string;
  previewLegacyFallback: string;
  uploadExists: string;
  deleteDocConfirm: string;
};

type PreviewFlags = {
  enableNewPreviewModal: boolean;
  enableNewPreviewByType: Record<string, boolean>;
};

const DEFAULT_PREVIEW_FLAGS: PreviewFlags = {
  enableNewPreviewModal: true,
  enableNewPreviewByType: {},
};

const SAFE_FALLBACK_PREVIEW_FLAGS: PreviewFlags = {
  enableNewPreviewModal: false,
  enableNewPreviewByType: {},
};

function toTypeKey(docType: string | null | undefined): string {
  return (docType || '').trim().toLowerCase().replace(/^\./, '');
}

function parsePreviewFlags(payload: unknown): PreviewFlags {
  if (!payload || typeof payload !== 'object') {
    return DEFAULT_PREVIEW_FLAGS;
  }

  const input = payload as {
    enableNewPreviewModal?: unknown;
    enableNewPreviewByType?: unknown;
  };

  const rawByType = input.enableNewPreviewByType;
  const enableNewPreviewByType: Record<string, boolean> = {};
  if (rawByType && typeof rawByType === 'object') {
    for (const [key, value] of Object.entries(rawByType as Record<string, unknown>)) {
      if (typeof value === 'boolean') {
        enableNewPreviewByType[key.trim().toLowerCase()] = value;
      }
    }
  }

  return {
    enableNewPreviewModal: input.enableNewPreviewModal !== false,
    enableNewPreviewByType,
  };
}

function shouldUseLegacyPreview(docType: string | null | undefined, flags: PreviewFlags): boolean {
  if (!flags.enableNewPreviewModal) {
    return true;
  }

  const rawType = (docType || '').trim().toLowerCase();
  const normalizedType = toTypeKey(docType);
  const byType = flags.enableNewPreviewByType;

  if (rawType && byType[rawType] === false) {
    return true;
  }

  if (normalizedType && byType[normalizedType] === false) {
    return true;
  }

  return false;
}

function resolvePreviewSizePreset(docType: string | null | undefined): 'default' | 'a4' {
  const normalized = (docType || '').trim().toLowerCase();
  if (normalized === '.pdf' || normalized === 'pdf' || normalized === '.doc' || normalized === 'doc' || normalized === '.docx' || normalized === 'docx') {
    return 'a4';
  }
  return 'default';
}

function resolvePreviewViewportPreset(docType: string | null | undefined): 'default' | 'a4' {
  const normalized = (docType || '').trim().toLowerCase();
  if (
    normalized === '.pdf'
    || normalized === 'pdf'
    || normalized === '.doc'
    || normalized === 'doc'
    || normalized === '.docx'
    || normalized === 'docx'
    || normalized === '.txt'
    || normalized === 'txt'
    || normalized === '.json'
    || normalized === 'json'
    || normalized === '.md'
    || normalized === 'md'
    || normalized === '.markdown'
    || normalized === 'markdown'
    || normalized === '.log'
    || normalized === 'log'
  ) {
    return 'a4';
  }
  return 'default';
}

type DocumentListPanelProps = {
  isDarkTheme: boolean;
  language: 'zh' | 'en';
  locale: DocumentListLocale;
  apiUrl: (endpoint: string) => string;
  onOpenDetail: (doc: Document, highlight?: {chunkId?: string; chunkIndex?: number}) => void;
  onBackToQa?: () => void;
  previewRequest?: MessageSource | null;
  previewRequestDoc?: Document | null;
  onPreviewRequestHandled?: () => void;
  onDocumentDeleted?: (docId: string) => void;
};

export function DocumentListPanel({
  isDarkTheme,
  language,
  locale,
  apiUrl,
  onOpenDetail,
  onBackToQa,
  previewRequest = null,
  previewRequestDoc = null,
  onPreviewRequestHandled,
  onDocumentDeleted,
}: DocumentListPanelProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewFlags, setPreviewFlags] = useState<PreviewFlags>(DEFAULT_PREVIEW_FLAGS);
  const [newPreviewDoc, setNewPreviewDoc] = useState<Document | null>(null);
  const [legacyPreviewDoc, setLegacyPreviewDoc] = useState<Document | null>(null);
  const [legacyPreviewChunks, setLegacyPreviewChunks] = useState<Chunk[]>([]);
  const [activePreviewSource, setActivePreviewSource] = useState<MessageSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const legacyPreviewRequestVersionRef = useRef(0);
  const handledPreviewRequestRef = useRef<string | null>(null);
  const onPreviewRequestHandledRef = useRef(onPreviewRequestHandled);

  useEffect(() => {
    onPreviewRequestHandledRef.current = onPreviewRequestHandled;
  }, [onPreviewRequestHandled]);

  const previewResourceState = useDocumentPreviewResource({
    apiUrl,
    documentId: newPreviewDoc?.id,
    documentType: newPreviewDoc?.type,
    enabled: Boolean(newPreviewDoc),
  });

  const fetchDocs = async () => {
    try {
      const res = await fetch(apiUrl('/api/documents'));
      const data = await res.json();
      setDocuments(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDocs();
    const interval = setInterval(fetchDocs, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    fetch(apiUrl('/api/settings/preview-flags'))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`preview-flags request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((data: unknown) => {
        if (active) {
          setPreviewFlags(parsePreviewFlags(data));
        }
      })
      .catch(() => {
        if (active) {
          setPreviewFlags(SAFE_FALLBACK_PREVIEW_FLAGS);
        }
      });

    return () => {
      active = false;
    };
  }, [apiUrl]);

  const openLegacyPreview = async (doc: Document) => {
    legacyPreviewRequestVersionRef.current += 1;
    const requestVersion = legacyPreviewRequestVersionRef.current;

    try {
      const res = await fetch(apiUrl(`/api/documents/${doc.id}`));
      const data = await res.json();

      if (requestVersion !== legacyPreviewRequestVersionRef.current) {
        return;
      }

      setNewPreviewDoc(null);
      setLegacyPreviewDoc(doc);
      setLegacyPreviewChunks(Array.isArray(data?.chunks) ? data.chunks : []);
    } catch (e) {
      console.error(e);

      if (requestVersion !== legacyPreviewRequestVersionRef.current) {
        return;
      }

      setNewPreviewDoc(null);
      setLegacyPreviewDoc(doc);
      setLegacyPreviewChunks([]);
    }
  };

  useEffect(() => {
    if (!newPreviewDoc || !previewResourceState.error) {
      return;
    }

    void openLegacyPreview(newPreviewDoc);
  }, [newPreviewDoc, previewResourceState.error]);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(apiUrl('/api/upload'), {method: 'POST', body: formData});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fallbackMessage = language === 'zh' ? '上传失败，请稍后重试' : 'Upload failed. Please try again.';
        setUploadError(typeof data?.error === 'string' && data.error.trim() ? data.error : fallbackMessage);
        return;
      }
      if (data.status === 'exists') alert(locale.uploadExists);
      fetchDocs();
    } catch (e) {
      console.error(e);
      setUploadError(language === 'zh' ? '上传失败，请稍后重试' : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm(locale.deleteDocConfirm)) return;
    await fetch(apiUrl(`/api/documents/${id}`), {method: 'DELETE'});
    onDocumentDeleted?.(id);
    fetchDocs();
  };

  const retryDoc = async (id: string) => {
    try {
      await fetch(apiUrl(`/api/documents/${id}/retry`), {method: 'POST'});
      setDocuments((prev) => prev.map((doc) => (doc.id === id ? {...doc, jobStatus: 'running'} : doc)));
      fetchDocs();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePreview = async (doc: Document, source: MessageSource | null = null) => {
    setActivePreviewSource(source);

    if (!shouldUseLegacyPreview(doc.type, previewFlags)) {
      legacyPreviewRequestVersionRef.current += 1;
      setLegacyPreviewDoc(null);
      setLegacyPreviewChunks([]);
      setNewPreviewDoc(doc);
      return;
    }

    await openLegacyPreview(doc);
  };

  const closeNewPreview = () => {
    setNewPreviewDoc(null);
    setActivePreviewSource(null);
  };

  const closeLegacyPreview = () => {
    legacyPreviewRequestVersionRef.current += 1;
    setLegacyPreviewDoc(null);
    setLegacyPreviewChunks([]);
    setActivePreviewSource(null);
  };

  useEffect(() => {
    if (!previewRequest?.docId) {
      handledPreviewRequestRef.current = null;
      return;
    }

    const requestKey = buildSourceHighlightRequestKey(previewRequest);
    if (requestKey === handledPreviewRequestRef.current) {
      return;
    }

    let cancelled = false;

    const openFromPreviewRequest = async () => {
      let matchedDoc = previewRequestDoc && previewRequestDoc.id === previewRequest.docId
        ? previewRequestDoc
        : (documents.find((doc) => doc.id === previewRequest.docId) ?? null);

      if (!matchedDoc) {
        try {
          const response = await fetch(apiUrl(`/api/documents/${previewRequest.docId}`));
          if (response.ok) {
            const data = await response.json();
            matchedDoc = {
              id: typeof data?.id === 'string' ? data.id : previewRequest.docId,
              name: typeof data?.name === 'string' ? data.name : (previewRequest.docName || '未知文档'),
              size: typeof data?.size === 'number' ? data.size : 0,
              type: typeof data?.type === 'string' ? data.type : '.txt',
              uploadTime: typeof data?.uploadTime === 'string' ? data.uploadTime : new Date().toISOString(),
              status: data?.status === 'processing' || data?.status === 'failed' || data?.status === 'cancelled' ? data.status : 'completed',
              chunkCount: typeof data?.chunkCount === 'number' ? data.chunkCount : 0,
              description: typeof data?.description === 'string' ? data.description : '',
            };
          }
        } catch {
          // ignore fallback lookup errors
        }
      }

      if (cancelled) {
        return;
      }

      if (!matchedDoc) {
        window.alert('对应文档不存在或已删除，无法定位溯源。');
        onPreviewRequestHandledRef.current?.();
        return;
      }

      handledPreviewRequestRef.current = requestKey;
      await handlePreview(matchedDoc, previewRequest);
      if (!cancelled) {
        onPreviewRequestHandledRef.current?.();
      }
    };

    void openFromPreviewRequest();

    return () => {
      cancelled = true;
    };
  }, [documents, previewRequest, previewRequestDoc, apiUrl]);

  return (
    <div className={`flex-1 flex flex-col p-6 overflow-hidden ${isDarkTheme ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <div className={`max-w-6xl w-full mx-auto flex-1 flex flex-col rounded-xl shadow-sm border overflow-hidden ${isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
        <div className={`p-6 border-b flex flex-col gap-4 shrink-0 ${isDarkTheme ? 'border-slate-800' : 'border-gray-100'}`}>
          {uploadError && (
            <div
              role="alert"
              className={cn(
                'px-3 py-2 text-sm rounded-lg border',
                isDarkTheme ? 'bg-red-900/40 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-700',
              )}
            >
              {uploadError}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            {isUploading ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}
            {locale.uploadDoc} ({locale.uploadFeatureHint})
          </button>
          <input
            type="file"
            ref={fileInputRef}
            data-testid="documents-upload-input"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          <div
            data-testid="document-dropzone"
            ref={dragRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleUpload(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer',
              isDarkTheme
                ? 'border-slate-600 text-slate-300 bg-slate-900/60 hover:bg-slate-800/80 hover:border-sky-400'
                : 'border-gray-300 text-gray-400 bg-gray-50 hover:bg-blue-50 hover:border-blue-400',
            )}
          >
            <Folder size={32} className={cn('mb-2', isDarkTheme ? 'text-slate-300' : 'text-gray-400')} />
            <span className={cn('text-sm font-medium', isDarkTheme ? 'text-slate-100' : 'text-gray-600')}>{locale.uploadHint}</span>
            <span className={cn('text-xs mt-1', isDarkTheme ? 'text-slate-400' : 'text-gray-500')}>{locale.uploadSupport}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className={cn('sticky top-0 border-b z-10', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-200')}>
              <tr>
                <th className={cn('py-3 px-6 text-xs font-semibold uppercase tracking-wider', isDarkTheme ? 'text-slate-300' : 'text-gray-600')}>{locale.colName}</th>
                <th className={cn('py-3 px-6 text-xs font-semibold uppercase tracking-wider text-center', isDarkTheme ? 'text-slate-300' : 'text-gray-600')}>{locale.colSize}</th>
                <th className={cn('py-3 px-6 text-xs font-semibold uppercase tracking-wider text-center', isDarkTheme ? 'text-slate-300' : 'text-gray-600')}>{locale.colType}</th>
                <th className={cn('py-3 px-6 text-xs font-semibold uppercase tracking-wider text-center', isDarkTheme ? 'text-slate-300' : 'text-gray-600')}>{locale.colUploadTime}</th>
                <th className={cn('py-3 px-6 text-xs font-semibold uppercase tracking-wider text-center', isDarkTheme ? 'text-slate-300' : 'text-gray-600')}>{locale.colStatus}</th>
                <th className={cn('py-3 px-6 text-xs font-semibold uppercase tracking-wider text-center', isDarkTheme ? 'text-slate-300' : 'text-gray-600')}>{locale.colActions}</th>
              </tr>
            </thead>
            <tbody className={cn('divide-y', isDarkTheme ? 'divide-slate-800' : 'divide-gray-100')}>
              {documents.map((doc) => {
                const displayStatus = doc.jobStatus === 'running'
                  ? 'processing'
                  : doc.status === 'cancelled'
                    ? 'failed'
                  : doc.status;

                return (
                <tr key={doc.id} className={cn('transition-colors', isDarkTheme ? 'hover:bg-slate-800/60 even:bg-slate-900/40' : 'hover:bg-gray-50/50 even:bg-gray-50/30')}>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      {doc.type === '.xlsx' || doc.type === '.csv' ? <FileSpreadsheet size={18} className={isDarkTheme ? 'text-emerald-300' : 'text-green-600'} /> : doc.type === '.pdf' ? <File size={18} className="text-red-500" /> : <File size={18} className={isDarkTheme ? 'text-sky-300' : 'text-blue-500'} />}
                      <span className={cn('font-medium truncate max-w-[200px]', isDarkTheme ? 'text-slate-100' : 'text-gray-800')} title={doc.name}>{doc.name}</span>
                    </div>
                  </td>
                  <td className={cn('py-4 px-6 text-sm text-center', isDarkTheme ? 'text-slate-300' : 'text-gray-500')}>{(doc.size / 1024 / 1024).toFixed(2)} MB</td>
                  <td className={cn('py-4 px-6 text-sm text-center', isDarkTheme ? 'text-slate-300' : 'text-gray-500')}>{doc.type}</td>
                  <td className={cn('py-4 px-6 text-sm text-center', isDarkTheme ? 'text-slate-300' : 'text-gray-500')}>{doc.uploadTime ? format(new Date(doc.uploadTime), 'yyyy-MM-dd HH:mm') : '-'}</td>
                  <td className="py-4 px-6 text-center">
                    {displayStatus === 'processing' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        <Loader2 size={12} className="animate-spin" /> {locale.statusProcessing}
                      </span>
                    ) : displayStatus === 'completed' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                        <CheckCircle2 size={12} /> {locale.statusCompleted}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                        <CircleX size={12} />
                        {locale.statusFailed}
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-left">
                    <div className="flex items-center justify-start gap-2">
                      <button type="button" onClick={() => handlePreview(doc, null)} className={cn('p-1.5 rounded transition-colors', isDarkTheme ? 'text-slate-400 hover:text-sky-300 hover:bg-slate-800' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50')} title={locale.previewAction} aria-label={locale.previewAction}>
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDetail(doc)}
                        className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 rounded transition-colors"
                      >
                        {locale.detailAction}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDoc(doc.id)}
                        className={cn('p-1.5 rounded transition-colors', isDarkTheme ? 'text-slate-400 hover:text-red-300 hover:bg-red-900/30' : 'text-gray-400 hover:text-red-600 hover:bg-red-50')}
                        title={locale.deleteAction}
                        aria-label={locale.deleteAction}
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => retryDoc(doc.id)}
                        disabled={displayStatus !== 'failed'}
                        className={cn(
                          'px-3 py-1 text-xs font-medium rounded transition-colors',
                          displayStatus === 'failed'
                            ? 'text-amber-700 border border-amber-200 hover:bg-amber-50'
                            : 'text-gray-400 border border-gray-200 bg-gray-50 cursor-not-allowed',
                        )}
                      >
                        {locale.retryAction}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {documents.length === 0 && (
                <tr>
                  <td colSpan={6} className={cn('py-10 text-center', isDarkTheme ? 'text-slate-400' : 'text-gray-400')}>{locale.noDocuments}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PreviewModal
        open={Boolean(newPreviewDoc)}
        fileName={newPreviewDoc?.name ?? '-'}
        size={newPreviewDoc?.size ?? null}
        type={newPreviewDoc?.type ?? null}
        uploadTime={newPreviewDoc?.uploadTime ?? null}
        chunkCount={newPreviewDoc?.chunkCount ?? null}
        sizePreset={resolvePreviewSizePreset(newPreviewDoc?.type)}
        viewportPreset={resolvePreviewViewportPreset(newPreviewDoc?.type)}
        contentPadding={(
          newPreviewDoc?.type?.toLowerCase() === '.pdf'
          || newPreviewDoc?.type?.toLowerCase() === '.doc'
          || newPreviewDoc?.type?.toLowerCase() === '.docx'
          || newPreviewDoc?.type?.toLowerCase() === '.txt'
          || newPreviewDoc?.type?.toLowerCase() === '.json'
        ) ? 'none' : 'default'}
        onClose={closeNewPreview}
        onViewDetails={newPreviewDoc
          ? () => {
            closeNewPreview();
            onOpenDetail(newPreviewDoc, activePreviewSource && activePreviewSource.docId === newPreviewDoc.id
              ? {chunkId: activePreviewSource.chunkId, chunkIndex: activePreviewSource.chunkIndex}
              : undefined);
          }
          : undefined}
        onLocateChunk={newPreviewDoc
          ? () => {
            closeNewPreview();
            onOpenDetail(newPreviewDoc, activePreviewSource && activePreviewSource.docId === newPreviewDoc.id
              ? {chunkId: activePreviewSource.chunkId, chunkIndex: activePreviewSource.chunkIndex}
              : undefined);
          }
          : undefined}
        labels={{
          viewDetails: locale.openDetails,
          download: locale.previewDownloadAction,
          close: locale.close,
          closeAriaLabel: locale.previewCloseAriaLabel,
          locateChunk: locale.previewLocateChunk,
          metaSize: locale.previewMetaSize,
          metaType: locale.previewMetaType,
          metaUploadTime: locale.colUploadTime,
          metaChunkCount: locale.previewMetaChunks,
        }}
      >
        <DocumentPreviewContent
          mimeType={previewResourceState.resource?.mimeType ?? null}
          fileName={newPreviewDoc?.name ?? null}
          extension={newPreviewDoc?.type ?? null}
          fallbackType={newPreviewDoc?.type ?? null}
          resource={previewResourceState.resource}
          loading={previewResourceState.loading}
          error={previewResourceState.error}
          sourceHighlight={activePreviewSource && activePreviewSource.docId === newPreviewDoc?.id ? normalizeSourceHighlightTarget(activePreviewSource) : null}
          onLocateChunk={newPreviewDoc
            ? () => {
              closeNewPreview();
              onOpenDetail(newPreviewDoc, activePreviewSource && activePreviewSource.docId === newPreviewDoc.id
                ? {chunkId: activePreviewSource.chunkId, chunkIndex: activePreviewSource.chunkIndex}
                : undefined);
            }
            : undefined}
          onBackToQa={onBackToQa}
          fallbackLabel={locale.previewLegacyFallback}
          loadingLabel={locale.previewLoading}
          errorLabel={locale.previewLoadError}
        />
      </PreviewModal>

      <LegacyChunkPreviewModal
        open={Boolean(legacyPreviewDoc)}
        isDarkTheme={isDarkTheme}
        language={language}
        locale={locale}
        document={legacyPreviewDoc}
        chunks={legacyPreviewChunks}
        onClose={closeLegacyPreview}
        onOpenDetails={onOpenDetail}
      />
    </div>
  );
}
