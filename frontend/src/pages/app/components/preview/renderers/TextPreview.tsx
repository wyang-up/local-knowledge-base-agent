import {useMemo, useState} from 'react';

type TextPreviewProps = {
  text: string;
  isPartialPreview?: boolean;
  errorMessage?: string;
};

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

export function TextPreview({text, isPartialPreview = false, errorMessage}: TextPreviewProps) {
  const [keyword, setKeyword] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const trimmedKeyword = keyword.trim();
  const matchCount = useMemo(() => countMatches(text, trimmedKeyword), [text, trimmedKeyword]);

  const statusMessage = useMemo(() => {
    if (copyMessage) {
      return copyMessage;
    }

    if (!trimmedKeyword) {
      return '';
    }

    return matchCount > 0 ? `已匹配 ${matchCount} 处` : '未找到匹配结果';
  }, [copyMessage, trimmedKeyword, matchCount]);

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyMessage('当前环境不支持复制，请手动复制。');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage('已复制。');
    } catch {
      setCopyMessage('复制失败，请稍后重试。');
    }
  };

  const renderContent = () => {
    if (!trimmedKeyword) {
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
    <section data-testid="text-preview-renderer">
      <div>
        <label htmlFor="text-preview-search-input">搜索文本</label>
        <input
          id="text-preview-search-input"
          type="search"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            if (copyMessage) {
              setCopyMessage('');
            }
          }}
        />
        <button type="button" onClick={() => void handleCopy()}>
          复制全文
        </button>
        <span role="status" aria-live="polite">
          {statusMessage}
        </span>
      </div>

      {isPartialPreview ? <p>当前仅展示部分预览内容。</p> : null}

      <div
        data-testid="text-preview-scroll-container"
        className="overflow-auto max-h-[480px]"
        style={{whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}
      >
        <article data-testid="text-preview-content">{renderContent()}</article>
      </div>
    </section>
  );
}
