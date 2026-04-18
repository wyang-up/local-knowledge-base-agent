import {useEffect, useMemo, useRef} from 'react';
import type {SourceHighlightTarget} from '../source-highlight-target';
import {HighlightBlock} from './highlight-block';

type JsonPreviewProps = {
  value: unknown;
  isPartialPreview?: boolean;
  errorMessage?: string;
  sourceHighlight?: SourceHighlightTarget | null;
  onSourceBlockClick?: () => void;
  onSourceBlockAuxClick?: () => void;
};

type TextRange = {
  start: number;
  end: number;
};

function isValidRange(range: TextRange | null, textLength: number): range is TextRange {
  return Boolean(range && range.start >= 0 && range.end > range.start && range.end <= textLength);
}

function tryParseJson(value: unknown): {parsed: unknown; text: string; parseError: string | null; didParse: boolean} {
  if (typeof value !== 'string') {
    try {
      return {parsed: value, text: JSON.stringify(value, null, 2), parseError: null, didParse: true};
    } catch {
      return {parsed: value, text: String(value), parseError: null, didParse: false};
    }
  }

  try {
    const parsed = JSON.parse(value);
    return {parsed, text: JSON.stringify(parsed, null, 2), parseError: null, didParse: true};
  } catch {
    return {parsed: null, text: value, parseError: 'JSON 格式错误，无法解析预览内容。', didParse: false};
  }
}

function toJsonPathSegment(key: string): string {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) {
    return `.${key}`;
  }

  return `[${JSON.stringify(key)}]`;
}

function appendJsonNode(parts: string[], ranges: Map<string, TextRange>, value: unknown, path: string, indent: number): void {
  const start = parts.join('').length;

  if (Array.isArray(value)) {
    if (value.length === 0) {
      parts.push('[]');
    } else {
      const childIndent = ' '.repeat(indent + 2);
      const closingIndent = ' '.repeat(indent);
      parts.push('[\n');
      value.forEach((item, index) => {
        if (index > 0) {
          parts.push(',\n');
        }
        parts.push(childIndent);
        appendJsonNode(parts, ranges, item, `${path}[${index}]`, indent + 2);
      });
      parts.push(`\n${closingIndent}]`);
    }
  } else if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      parts.push('{}');
    } else {
      const childIndent = ' '.repeat(indent + 2);
      const closingIndent = ' '.repeat(indent);
      parts.push('{\n');
      entries.forEach(([key, childValue], index) => {
        if (index > 0) {
          parts.push(',\n');
        }
        parts.push(childIndent, `${JSON.stringify(key)}: `);
        appendJsonNode(parts, ranges, childValue, `${path}${toJsonPathSegment(key)}`, indent + 2);
      });
      parts.push(`\n${closingIndent}}`);
    }
  } else {
    parts.push(JSON.stringify(value));
  }

  ranges.set(path, {start, end: parts.join('').length});
}

function buildJsonPathRanges(value: unknown): Map<string, TextRange> {
  const parts: string[] = [];
  const ranges = new Map<string, TextRange>();
  appendJsonNode(parts, ranges, value, '$', 0);
  return ranges;
}

function findStructuredJsonRange(text: string, parsed: unknown, didParse: boolean, sourceHighlight: SourceHighlightTarget | null): TextRange | null {
  const offsetStart = sourceHighlight?.nodeStartOffset;
  const offsetEnd = sourceHighlight?.nodeEndOffset;
  if (typeof offsetStart === 'number' && typeof offsetEnd === 'number') {
    const offsetRange = {start: offsetStart, end: offsetEnd};
    if (isValidRange(offsetRange, text.length)) {
      return offsetRange;
    }
  }

  const jsonPath = sourceHighlight?.jsonPath?.trim();
  if (jsonPath && didParse) {
    return buildJsonPathRanges(parsed).get(jsonPath) ?? null;
  }

  return null;
}

function findWhitespaceInsensitiveRange(text: string, snippet: string): TextRange | null {
  const compactSnippet = snippet.replace(/\s+/g, '');
  if (!compactSnippet) {
    return null;
  }

  let compactText = '';
  const indexMap: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      continue;
    }
    compactText += char;
    indexMap.push(index);
  }

  const compactStart = compactText.indexOf(compactSnippet);
  if (compactStart < 0) {
    return null;
  }

  const compactEnd = compactStart + compactSnippet.length - 1;
  return {
    start: indexMap[compactStart],
    end: indexMap[compactEnd] + 1,
  };
}

export function JsonPreview({value, isPartialPreview = false, errorMessage, sourceHighlight = null, onSourceBlockClick, onSourceBlockAuxClick}: JsonPreviewProps) {
  const {parsed, text, parseError, didParse} = useMemo(() => tryParseJson(value), [value]);
  const preRef = useRef<HTMLPreElement | null>(null);

  const finalErrorMessage = errorMessage ?? parseError;
  const sourceKeyword = sourceHighlight?.content?.trim() || '';
  const sourceQuote = sourceHighlight?.textQuote?.trim() || '';
  const sourceRange = useMemo(() => {
    const structuredRange = findStructuredJsonRange(text, parsed, didParse, sourceHighlight);
    if (structuredRange) {
      return structuredRange;
    }

    if (sourceQuote) {
      const quoteRange = findWhitespaceInsensitiveRange(text, sourceQuote);
      if (quoteRange) {
        return quoteRange;
      }
    }

    if (sourceKeyword) {
      return findWhitespaceInsensitiveRange(text, sourceKeyword);
    }

    return null;
  }, [didParse, parsed, sourceHighlight, sourceKeyword, sourceQuote, text]);

  useEffect(() => {
    if (!preRef.current || !sourceRange) {
      return;
    }

    const node = preRef.current;
    const ratio = sourceRange.start / Math.max(text.length, 1);
    node.scrollTop = Math.max(0, (node.scrollHeight - node.clientHeight) * ratio);
  }, [sourceRange, text]);

  if (finalErrorMessage) {
    return (
      <div role="alert" data-testid="json-preview-error">
        <p>JSON 预览失败，请稍后重试。</p>
        <p>{finalErrorMessage}</p>
      </div>
    );
  }

  const renderContent = () => {
    if (sourceRange) {
      const before = text.slice(0, sourceRange.start);
      const match = text.slice(sourceRange.start, sourceRange.end);
      const after = text.slice(sourceRange.end);
      return (
        <>
          {before}
          <HighlightBlock onClick={onSourceBlockClick}>
            <span data-testid="json-preview-source-highlight" className="block px-2 py-1">{match}</span>
            {onSourceBlockAuxClick ? (
              <button
                type="button"
                data-testid="json-preview-source-highlight-back-to-qa"
                onClick={(event) => {
                  event.stopPropagation();
                  onSourceBlockAuxClick();
                }}
                className="ml-2 mb-2 rounded-[8px] border border-[#1677FF]/35 px-2 py-1 text-xs text-[#1677FF] hover:bg-blue-50"
              >
                返回AI回答
              </button>
            ) : null}
          </HighlightBlock>
          {after}
        </>
      );
    }
    return text;
  };

  return (
    <section data-testid="json-preview-renderer" className="h-full min-h-0 flex flex-col">
      {isPartialPreview ? <p>当前仅展示部分预览内容。</p> : null}

      <pre
        ref={preRef}
        data-testid="json-preview-content"
        className="min-h-0 flex-1 overflow-auto px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-words"
      >
        {renderContent()}
      </pre>
    </section>
  );
}
