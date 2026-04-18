export type SourceHighlightTarget = {
  docId?: string;
  chunkId?: string;
  chunkIndex?: number;
  content?: string;
  originStart?: string;
  originEnd?: string;
  pageStart?: number;
  pageEnd?: number;
  textQuote?: string;
  textOffsetStart?: number;
  textOffsetEnd?: number;
  sheetId?: string;
  sheetName?: string;
  rowStart?: number;
  rowEnd?: number;
  columnStart?: number;
  columnEnd?: number;
  jsonPath?: string;
  nodeStartOffset?: number;
  nodeEndOffset?: number;
};

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown, {allowZero = true, min = 0}: {allowZero?: boolean; min?: number} = {}): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  if (!allowZero && value === 0) {
    return undefined;
  }
  if (value < min) {
    return undefined;
  }
  return value;
}

export function normalizeSourceHighlightTarget(input: unknown): SourceHighlightTarget | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const target: SourceHighlightTarget = {
    docId: readString(raw.docId),
    chunkId: readString(raw.chunkId),
    chunkIndex: readNumber(raw.chunkIndex, {min: 0}),
    content: readString(raw.content),
    originStart: readString(raw.originStart),
    originEnd: readString(raw.originEnd),
    pageStart: readNumber(raw.pageStart, {min: 0, allowZero: false}),
    pageEnd: readNumber(raw.pageEnd, {min: 0, allowZero: false}),
    textQuote: readString(raw.textQuote),
    textOffsetStart: readNumber(raw.textOffsetStart, {min: 0}),
    textOffsetEnd: readNumber(raw.textOffsetEnd, {min: 0}),
    sheetId: readString(raw.sheetId),
    sheetName: readString(raw.sheetName),
    rowStart: readNumber(raw.rowStart, {min: 0}),
    rowEnd: readNumber(raw.rowEnd, {min: 0}),
    columnStart: readNumber(raw.columnStart, {min: 0}),
    columnEnd: readNumber(raw.columnEnd, {min: 0}),
    jsonPath: readString(raw.jsonPath),
    nodeStartOffset: readNumber(raw.nodeStartOffset, {min: 0}),
    nodeEndOffset: readNumber(raw.nodeEndOffset, {min: 0}),
  };

  if (!target.docId && !target.chunkId && typeof target.chunkIndex !== 'number' && !target.content) {
    return null;
  }

  return target;
}

export function buildSourceHighlightRequestKey(target: unknown): string {
  const normalizedTarget = normalizeSourceHighlightTarget(target);
  if (!normalizedTarget) {
    return '';
  }

  return JSON.stringify({
    content: normalizedTarget.content ?? '',
    docId: normalizedTarget.docId ?? '',
    chunkId: normalizedTarget.chunkId ?? '',
    chunkIndex: typeof normalizedTarget.chunkIndex === 'number' ? normalizedTarget.chunkIndex : '',
    pageStart: normalizedTarget.pageStart ?? '',
    pageEnd: normalizedTarget.pageEnd ?? '',
    originStart: normalizedTarget.originStart ?? '',
    originEnd: normalizedTarget.originEnd ?? '',
    textQuote: normalizedTarget.textQuote ?? '',
    textOffsetStart: normalizedTarget.textOffsetStart ?? '',
    textOffsetEnd: normalizedTarget.textOffsetEnd ?? '',
    sheetId: normalizedTarget.sheetId ?? '',
    sheetName: normalizedTarget.sheetName ?? '',
    rowStart: normalizedTarget.rowStart ?? '',
    rowEnd: normalizedTarget.rowEnd ?? '',
    columnStart: normalizedTarget.columnStart ?? '',
    columnEnd: normalizedTarget.columnEnd ?? '',
    jsonPath: normalizedTarget.jsonPath ?? '',
    nodeStartOffset: normalizedTarget.nodeStartOffset ?? '',
    nodeEndOffset: normalizedTarget.nodeEndOffset ?? '',
  });
}
