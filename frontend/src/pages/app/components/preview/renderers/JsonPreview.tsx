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

function tryParseJson(value: unknown): {text: string; parseError: string | null} {
  if (typeof value !== 'string') {
    try {
      return {text: JSON.stringify(value, null, 2), parseError: null};
    } catch {
      return {text: String(value), parseError: null};
    }
  }

  try {
    const parsed = JSON.parse(value);
    return {text: JSON.stringify(parsed, null, 2), parseError: null};
  } catch {
    return {text: value, parseError: 'JSON 格式错误，无法解析预览内容。'};
  }
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
  const {text, parseError} = useMemo(() => tryParseJson(value), [value]);
  const preRef = useRef<HTMLPreElement | null>(null);

  const finalErrorMessage = errorMessage ?? parseError;
  const sourceKeyword = sourceHighlight?.content?.trim() || '';
  const sourceRange = useMemo(() => findWhitespaceInsensitiveRange(text, sourceKeyword), [text, sourceKeyword]);

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
