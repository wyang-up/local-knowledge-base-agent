import {useEffect, useMemo, useRef, useState, type KeyboardEvent} from 'react';
import type {SourceHighlightTarget} from '../source-highlight-target';

export type TablePreviewSheet = {
  id: string;
  name: string;
  columns?: string[];
  rows: Array<Array<string | number | null | undefined>>;
};

type TablePreviewProps = {
  sheets: TablePreviewSheet[];
  isPartialPreview?: boolean;
  errorMessage?: string;
  sourceHighlight?: SourceHighlightTarget | null;
  onSourceBlockClick?: () => void;
  onSourceBlockAuxClick?: () => void;
};

function getColumnCount(sheet: TablePreviewSheet): number {
  const headerCount = sheet.columns?.length ?? 0;
  const rowCount = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
  return Math.max(headerCount, rowCount);
}

function buildColumns(sheet: TablePreviewSheet): string[] {
  const columnCount = getColumnCount(sheet);
  return Array.from({length: columnCount}, (_, index) => sheet.columns?.[index] ?? `列 ${index + 1}`);
}

function normalizeCellValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function rowMatchesSource(row: Array<string | number | null | undefined>, source: string): boolean {
  const keyword = normalizeSearchText(source);
  if (!keyword) {
    return false;
  }

  const cells = row.map((cell) => normalizeSearchText(normalizeCellValue(cell))).filter(Boolean);
  const rowText = cells.join(' ');
  if (rowText && (rowText.includes(keyword) || keyword.includes(rowText))) {
    return true;
  }

  return cells.some((cell) => cell && (cell.includes(keyword) || keyword.includes(cell)));
}

export function TablePreview({sheets, isPartialPreview = false, errorMessage, sourceHighlight = null, onSourceBlockClick, onSourceBlockAuxClick}: TablePreviewProps) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeSheetIdRef = useRef<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);

  const sourceKeyword = sourceHighlight?.content?.trim() || '';
  const preferredSheetId = sourceHighlight?.sheetId?.trim() || '';
  const preferredSheetName = sourceHighlight?.sheetName?.trim() || '';

  useEffect(() => {
    setActiveSheetIndex(() => {
      if (sheets.length === 0) {
        activeSheetIdRef.current = null;
        return 0;
      }

      if (preferredSheetId) {
        const matchedIndex = sheets.findIndex((sheet) => sheet.id === preferredSheetId);
        if (matchedIndex >= 0) {
          return matchedIndex;
        }
      }

      if (preferredSheetName) {
        const matchedIndex = sheets.findIndex((sheet) => sheet.name === preferredSheetName);
        if (matchedIndex >= 0) {
          return matchedIndex;
        }
      }

      const normalizedKeyword = normalizeSearchText(sourceKeyword);
      if (normalizedKeyword) {
        const matchedIndex = sheets.findIndex((sheet) => sheet.rows.some((row) => rowMatchesSource(row, normalizedKeyword)));
        if (matchedIndex >= 0) {
          return matchedIndex;
        }
      }

      if (activeSheetIdRef.current) {
        const matchedIndex = sheets.findIndex((sheet) => sheet.id === activeSheetIdRef.current);
        if (matchedIndex >= 0) {
          return matchedIndex;
        }
      }

      return 0;
    });
  }, [sheets, sourceKeyword, preferredSheetId, preferredSheetName]);

  const activeSheet = sheets[activeSheetIndex] ?? null;
  const headers = useMemo(() => (activeSheet ? buildColumns(activeSheet) : []), [activeSheet]);

  useEffect(() => {
    activeSheetIdRef.current = activeSheet?.id ?? null;
  }, [activeSheet?.id]);

  useEffect(() => {
    if (!highlightedRowRef.current || typeof highlightedRowRef.current.scrollIntoView !== 'function') {
      return;
    }
    highlightedRowRef.current.scrollIntoView({behavior: 'smooth', block: 'start'});
  }, [activeSheetIndex, sourceKeyword]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (sheets.length < 2) {
      return;
    }

    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }

    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + direction + sheets.length) % sheets.length;
    setActiveSheetIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  if (errorMessage) {
    return (
      <div role="alert" data-testid="table-preview-error">
        <p>表格预览失败，请稍后重试。</p>
        <p>{errorMessage}</p>
      </div>
    );
  }

  if (!activeSheet) {
    return <p data-testid="table-preview-empty">暂无表格可预览。</p>;
  }

  const highlightedRowRange = (() => {
    if (typeof sourceHighlight?.rowStart === 'number') {
      const start = sourceHighlight.rowStart;
      const end = typeof sourceHighlight.rowEnd === 'number' ? sourceHighlight.rowEnd : start;
      return {start, end};
    }

    if (sourceKeyword) {
      const matchedIndex = activeSheet.rows.findIndex((row) => rowMatchesSource(row, sourceKeyword));
      if (matchedIndex >= 0) {
        return {start: matchedIndex, end: matchedIndex};
      }
    }

    return null;
  })();

  return (
    <section data-testid="table-preview-renderer">
      {sheets.length > 1 ? (
        <div
          role="tablist"
          aria-label="工作表切换"
          className="flex items-center gap-2 rounded-[8px] bg-[#e6f0ff] px-4 py-2 border-b border-[#1677FF]"
        >
          {sheets.map((sheet, index) => (
            <button
              key={sheet.id}
              id={`table-preview-tab-${sheet.id}`}
              role="tab"
              type="button"
              aria-selected={index === activeSheetIndex}
              aria-controls={`table-preview-panel-${sheet.id}`}
              tabIndex={index === activeSheetIndex ? 0 : -1}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              onClick={() => setActiveSheetIndex(index)}
              className={`rounded-[8px] border px-4 py-1.5 text-sm transition-all active:scale-[0.98] ${
                index === activeSheetIndex
                  ? 'border-[#1677FF] bg-[#1677FF] text-white'
                  : 'border-[#1677FF] bg-transparent text-[#333333] hover:bg-[#e6f0ff]'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      ) : null}

      {isPartialPreview ? <p>当前仅展示部分预览内容。</p> : null}

      <div
        id={`table-preview-panel-${activeSheet.id}`}
        role="tabpanel"
        aria-label={activeSheet.name}
        aria-labelledby={`table-preview-tab-${activeSheet.id}`}
      >
        <div data-testid="table-preview-scroll-container" className="overflow-auto max-h-[480px] max-w-full">
          <table role="table" aria-label={`${activeSheet.name} 表格预览`} className="min-w-max border-collapse">
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th key={`${activeSheet.id}-header-${index}`} className="sticky top-0 z-10 bg-white">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeSheet.rows.map((row, rowIndex) => (
              <tr
                key={`${activeSheet.id}-row-${rowIndex}`}
                ref={(node) => {
                  if (highlightedRowRange && rowIndex === highlightedRowRange.start) {
                    highlightedRowRef.current = node;
                  }
                }}
                data-testid={highlightedRowRange && rowIndex >= highlightedRowRange.start && rowIndex <= highlightedRowRange.end ? 'table-preview-source-highlight-row' : undefined}
                className={highlightedRowRange && rowIndex >= highlightedRowRange.start && rowIndex <= highlightedRowRange.end ? 'bg-[#FFF7CC] cursor-pointer' : undefined}
                onClick={highlightedRowRange && rowIndex >= highlightedRowRange.start && rowIndex <= highlightedRowRange.end ? onSourceBlockClick : undefined}
              >
                {headers.map((_, cellIndex) => (
                  <td key={`${activeSheet.id}-cell-${rowIndex}-${cellIndex}`}>{normalizeCellValue(row[cellIndex])}</td>
                ))}
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>

      {highlightedRowRange && onSourceBlockAuxClick ? (
        <div className="mt-2">
          <button
            type="button"
            data-testid="table-preview-source-highlight-back-to-qa"
            onClick={onSourceBlockAuxClick}
            className="rounded-[8px] border border-[#1677FF]/35 px-2 py-1 text-xs text-[#1677FF] hover:bg-blue-50"
          >
            返回AI回答
          </button>
        </div>
      ) : null}
    </section>
  );
}
