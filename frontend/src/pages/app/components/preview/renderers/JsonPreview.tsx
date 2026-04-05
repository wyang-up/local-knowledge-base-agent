import {useEffect, useMemo, useState} from 'react';

type JsonPreviewProps = {
  value: unknown;
  isPartialPreview?: boolean;
  errorMessage?: string;
};

function tryParseJson(value: unknown): {parsedValue: unknown; parseError: string | null} {
  if (typeof value !== 'string') {
    return {parsedValue: value, parseError: null};
  }

  try {
    return {parsedValue: JSON.parse(value), parseError: null};
  } catch {
    return {parsedValue: null, parseError: 'JSON 格式错误，无法解析预览内容。'};
  }
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCollapsible(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isObjectLike(value)) {
    return Object.keys(value).length > 0;
  }
  return false;
}

function getNodeSummary(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }
  if (isObjectLike(value)) {
    return `{${Object.keys(value).length}}`;
  }
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (value === null) {
    return 'null';
  }
  return String(value);
}

function stringifyForCopy(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type PathSegment = string | number;

function encodePath(pathSegments: PathSegment[]): string {
  return JSON.stringify(pathSegments);
}

export function JsonPreview({value, isPartialPreview = false, errorMessage}: JsonPreviewProps) {
  const {parsedValue, parseError} = useMemo(() => tryParseJson(value), [value]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([encodePath([])]));
  const [copyMessage, setCopyMessage] = useState('');

  const finalErrorMessage = errorMessage ?? parseError;

  useEffect(() => {
    setExpandedPaths(new Set([encodePath([])]));
  }, [parsedValue]);

  const togglePath = (pathKey: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(pathKey)) {
        next.delete(pathKey);
      } else {
        next.add(pathKey);
      }
      return next;
    });
  };

  const handleCopy = async () => {
    const textToCopy = stringifyForCopy(parsedValue);
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyMessage('当前环境不支持复制，请手动复制。');
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyMessage('已复制。');
    } catch {
      setCopyMessage('复制失败，请稍后重试。');
    }
  };

  const renderNode = (node: unknown, pathSegments: PathSegment[], keyName: string | null, depth: number) => {
    const pathKey = encodePath(pathSegments);
    const canCollapse = isCollapsible(node);
    const isExpanded = expandedPaths.has(pathKey);
    const isCollapsed = canCollapse && !isExpanded;
    const label = keyName ?? '根节点';

    return (
      <div key={pathKey}>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, marginLeft: depth * 16}}>
          {canCollapse ? (
            <button
              type="button"
              onClick={() => togglePath(pathKey)}
              aria-label={`${isCollapsed ? '展开' : '折叠'} ${label}`}
            >
              {isCollapsed ? '+' : '-'}
            </button>
          ) : (
            <span style={{width: 24, display: 'inline-block'}} />
          )}
          {keyName ? <span>{keyName}</span> : null}
          <code>{getNodeSummary(node)}</code>
        </div>

        {!isCollapsed && Array.isArray(node)
          ? node.map((item, index) => renderNode(item, [...pathSegments, index], String(index), depth + 1))
          : null}
        {!isCollapsed && isObjectLike(node)
          ? Object.entries(node).map(([childKey, childValue]) =>
              renderNode(childValue, [...pathSegments, childKey], childKey, depth + 1),
            )
          : null}
      </div>
    );
  };

  if (finalErrorMessage) {
    return (
      <div role="alert" data-testid="json-preview-error">
        <p>JSON 预览失败，请稍后重试。</p>
        <p>{finalErrorMessage}</p>
      </div>
    );
  }

  return (
    <section data-testid="json-preview-renderer">
      <div>
        <button type="button" onClick={() => void handleCopy()}>
          复制全文
        </button>
        {copyMessage ? (
          <span role="status" aria-live="polite">
            {copyMessage}
          </span>
        ) : null}
      </div>

      {isPartialPreview ? <p>当前仅展示部分预览内容。</p> : null}

      <div>{renderNode(parsedValue, [], null, 0)}</div>
    </section>
  );
}
