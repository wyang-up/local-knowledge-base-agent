import {useEffect, useMemo, useRef, useState} from 'react';
import type {SourceHighlightTarget} from '../source-highlight-target';
import {HighlightBlock} from './highlight-block';

type TextPreviewProps = {
  text: string;
  isPartialPreview?: boolean;
  errorMessage?: string;
  sourceHighlight?: SourceHighlightTarget | null;
  onSourceBlockClick?: () => void;
  onSourceBlockAuxClick?: () => void;
};

const LARGE_TEXT_RENDER_LIMIT = 200000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(text: string, keyword: string): number {
  if (!keyword) {
    return 0;
  }

  const pattern = new RegExp(escapeRegExp(keyword), 'gi');
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

export function TextPreview({text, isPartialPreview = false, errorMessage, sourceHighlight = null, onSourceBlockClick, onSourceBlockAuxClick}: TextPreviewProps) {
  const [keyword, setKeyword] = useState('');
  const highlightRef = useRef<HTMLElement | null>(null);

  const trimmedKeyword = keyword.trim();
  const matchCount = useMemo(() => countMatches(text, trimmedKeyword), [text, trimmedKeyword]);

  const statusMessage = useMemo(() => {
    if (!trimmedKeyword) {
      return '';
    }

    return matchCount > 0 ? `已匹配 ${matchCount} 处` : '未找到匹配结果';
  }, [trimmedKeyword, matchCount]);

  const shouldHighlight = text.length <= LARGE_TEXT_RENDER_LIMIT;
  const sourceKeyword = sourceHighlight?.content?.trim() || '';

  useEffect(() => {
    if (!highlightRef.current) {
      return;
    }
    if (typeof highlightRef.current.scrollIntoView === 'function') {
      highlightRef.current.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }, [sourceKeyword, text]);

  const renderContent = () => {
    if (sourceKeyword && shouldHighlight && text.includes(sourceKeyword)) {
      const index = text.indexOf(sourceKeyword);
      const before = text.slice(0, index);
      const match = text.slice(index, index + sourceKeyword.length);
      const after = text.slice(index + sourceKeyword.length);
      return (
        <>
          <span>{before}</span>
          <HighlightBlock onClick={onSourceBlockClick}>
            <span ref={highlightRef} data-testid="text-preview-source-highlight" className="block px-2 py-1">
              {match}
            </span>
            {onSourceBlockAuxClick ? (
              <button
                type="button"
                data-testid="text-preview-source-highlight-back-to-qa"
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
          <span>{after}</span>
        </>
      );
    }

    if (!trimmedKeyword) {
      return text;
    }

    if (!shouldHighlight) {
      return text;
    }

    const pattern = new RegExp(`(${escapeRegExp(trimmedKeyword)})`, 'gi');
    const segments = text.split(pattern);
    return segments.map((segment, index) => {
      if (segment.toLowerCase() === trimmedKeyword.toLowerCase()) {
        return (
          <mark key={`match-${index}`} data-testid="text-preview-highlight">
            {segment}
          </mark>
        );
      }

      return <span key={`segment-${index}`}>{segment}</span>;
    });
  };

  if (errorMessage) {
    return (
      <div role="alert" data-testid="text-preview-error">
        <p>文本预览失败，请稍后重试。</p>
        <p>{errorMessage}</p>
      </div>
    );
  }

  return (
    <section data-testid="text-preview-renderer" className="h-full min-h-0 flex flex-col">
      <div
        data-testid="text-preview-toolbar"
        className="w-full rounded-b-[8px] border-t border-b border-[rgba(255,255,255,0.2)] bg-[#1677FF] bg-gradient-to-b from-[#1677FF] to-[#1570F0] px-4 py-2 text-white"
      >
        <div className="flex items-center">
          <label htmlFor="text-preview-search-input" className="text-xs font-medium text-[#FFFFFF]">
          搜索文本
          </label>
          <input
            id="text-preview-search-input"
            type="search"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
            }}
            className="ml-2 mr-3 rounded-[8px] border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.15)] px-3 py-1 text-xs text-white placeholder:text-[#FFFFFF99] hover:bg-[rgba(255,255,255,0.22)] focus:bg-white focus:text-gray-700 focus:outline-none"
            placeholder="输入关键词"
          />
          <span role="status" aria-live="polite" className="text-xs text-white/90">
            {statusMessage}
          </span>
        </div>
      </div>

      {isPartialPreview ? <p>当前仅展示部分预览内容。</p> : null}

      <div
        data-testid="text-preview-scroll-container"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2"
        style={{whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}
      >
        <article data-testid="text-preview-content">{renderContent()}</article>
      </div>
    </section>
  );
}
