import {useEffect, useMemo, useRef, useState, type KeyboardEvent} from 'react';

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

export function TablePreview({sheets, isPartialPreview = false, errorMessage}: TablePreviewProps) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setActiveSheetIndex(0);
  }, [sheets]);

  const activeSheet = sheets[activeSheetIndex] ?? null;
  const headers = useMemo(() => (activeSheet ? buildColumns(activeSheet) : []), [activeSheet]);

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

  return (
    <section data-testid="table-preview-renderer">
      {sheets.length > 1 ? (
        <div role="tablist" aria-label="工作表切换">
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
              <tr key={`${activeSheet.id}-row-${rowIndex}`}>
                {headers.map((_, cellIndex) => (
                  <td key={`${activeSheet.id}-cell-${rowIndex}-${cellIndex}`}>{normalizeCellValue(row[cellIndex])}</td>
                ))}
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
