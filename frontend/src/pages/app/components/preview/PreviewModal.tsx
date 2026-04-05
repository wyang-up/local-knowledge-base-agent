import {type ReactNode, useEffect} from 'react';

type PreviewModalProps = {
  open: boolean;
  fileName: string;
  size: number | null;
  type: string | null;
  uploadTime: string | null;
  chunkCount: number | null;
  onClose: () => void;
  onViewDetails?: () => void;
  onDownload?: () => void;
  onLocateChunk?: () => void;
  labels?: {
    viewDetails?: string;
    download?: string;
    close?: string;
    closeAriaLabel?: string;
    locateChunk?: string;
    metaSize?: string;
    metaType?: string;
    metaUploadTime?: string;
    metaChunkCount?: string;
  };
  children?: ReactNode;
};

function formatBytes(size: number | null): string {
  if (size === null || Number.isNaN(size) || size < 0) {
    return '-';
  }
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function formatUploadTime(uploadTime: string | null): string {
  if (!uploadTime) {
    return '-';
  }
  const date = new Date(uploadTime);
  if (Number.isNaN(date.getTime())) {
    return uploadTime;
  }
  return date.toLocaleString();
}

export function PreviewModal({
  open,
  fileName,
  size,
  type,
  uploadTime,
  chunkCount,
  onClose,
  onViewDetails,
  onDownload,
  onLocateChunk,
  labels,
  children,
}: PreviewModalProps) {
  const resolvedLabels = {
    viewDetails: labels?.viewDetails ?? '查看详情',
    download: labels?.download ?? '下载',
    close: labels?.close ?? '关闭',
    closeAriaLabel: labels?.closeAriaLabel ?? '关闭预览',
    locateChunk: labels?.locateChunk ?? '定位分块',
    metaSize: labels?.metaSize ?? '大小',
    metaType: labels?.metaType ?? '类型',
    metaUploadTime: labels?.metaUploadTime ?? '上传时间',
    metaChunkCount: labels?.metaChunkCount ?? '分块数',
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      data-testid="preview-modal-mask"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`预览 ${fileName}`}
        className="flex w-full max-w-[90vw] max-h-[90vh] flex-col overflow-hidden rounded-[8px] bg-white shadow-xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
          <h2 className="truncate text-base font-semibold text-gray-900">{fileName}</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onViewDetails} className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700" disabled={!onViewDetails}>
              {resolvedLabels.viewDetails}
            </button>
            <button type="button" onClick={onDownload} className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700" disabled={!onDownload}>
              {resolvedLabels.download}
            </button>
            <button type="button" onClick={onClose} className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700" aria-label={resolvedLabels.closeAriaLabel}>
              {resolvedLabels.close}
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-4 py-3">{children}</main>

        <footer className="flex flex-wrap items-center gap-4 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
          <span>{resolvedLabels.metaSize}: {formatBytes(size)}</span>
          <span>{resolvedLabels.metaType}: {type || '-'}</span>
          <span>{resolvedLabels.metaUploadTime}: {formatUploadTime(uploadTime)}</span>
          <span>{resolvedLabels.metaChunkCount}: {chunkCount ?? '-'}</span>
          <button
            type="button"
            onClick={onLocateChunk}
            className="ml-auto rounded border border-gray-200 px-2 py-1 text-sm text-gray-700"
            disabled={!onLocateChunk}
          >
            {resolvedLabels.locateChunk}
          </button>
        </footer>
      </section>
    </div>
  );
}
