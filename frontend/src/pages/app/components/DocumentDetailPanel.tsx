import {format} from 'date-fns';
import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, ChevronDown, ChevronRight, Copy, Download, Printer, Settings, Share2} from 'lucide-react';
import {cn} from '../../../shared/lib/utils';
import type {Chunk, Document} from '../../../shared/types';

type DocumentDetailLocale = {
  backToDocs: string;
  detailParsed: string;
  previewMetaChunks: string;
  detailDescriptionLabel: string;
  detailDescriptionPlaceholder: string;
  detailOutlineTitle: string;
  detailNoOutline: string;
  detailSectionPrefix: string;
  detailChunkTitle: string;
  detailChunkHint: string;
  detailChunkTag: string;
  detailExpand: string;
  detailCollapse?: string;
  detailSummaryLabel?: string;
  detailSectionLabel?: string;
  detailCopyAction?: string;
  detailCopySuccess?: string;
  detailDownloadAction?: string;
  detailShareAction?: string;
  detailPrintAction?: string;
  detailInfoTitle?: string;
  detailInfoSize?: string;
  detailInfoType?: string;
  detailInfoUploadTime?: string;
  detailInfoChunkCount?: string;
  detailInfoCharCount?: string;
  tabSettings: string;
};

type DocumentDetailPanelProps = {
  isDarkTheme: boolean;
  locale: DocumentDetailLocale;
  details: Document & {chunks: Chunk[]};
  highlightedChunkId?: string | null;
  highlightedChunkIndex?: number | null;
  onSaveDescription: (description: string) => void;
  onBack: () => void;
  onOpenSettings: () => void;
  onRechunk?: () => void;
  onExportChunks?: () => void;
};

type OutlineNode = {
  id: string;
  title: string;
  level: number;
  chunkIds: string[];
  children: OutlineNode[];
  nodeType?: Chunk['nodeType'];
  lang?: Chunk['lang'];
};

type HeadingMatch = {title: string; level: number} | null;

function summarize(content: string) {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return '-';
  return compact.length > 52 ? `${compact.slice(0, 52)}...` : compact;
}

function extractHeading(content: string): HeadingMatch {
  const line = content.split('\n').map((item) => item.trim()).find(Boolean) ?? '';
  if (!line) return null;

  const markdown = line.match(/^(#{1,6})\s+(.+)$/);
  if (markdown) {
    return {title: markdown[2].trim(), level: markdown[1].length};
  }

  const cnNumeric = line.match(/^(\d+(?:\.\d+)*)[\s、.．]+(.+)$/);
  if (cnNumeric) {
    return {title: `${cnNumeric[1]} ${cnNumeric[2].trim()}`, level: cnNumeric[1].split('.').length};
  }

  const chapter = line.match(/^(Chapter\s+\d+[:\-\s].+|第[一二三四五六七八九十百千\d]+[章节回篇].*)$/i);
  if (chapter) {
    return {title: chapter[1].trim(), level: 1};
  }

  return null;
}

function buildOutline(chunks: Chunk[], fallbackPrefix: string): {
  roots: OutlineNode[];
  sectionByChunkId: Record<string, {id: string; title: string}>;
} {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  const sectionByChunkId: Record<string, {id: string; title: string}> = {};
  const fallbackNode: OutlineNode = {
    id: 'section-fallback',
    title: `${fallbackPrefix} 未命名`,
    level: 1,
    chunkIds: [],
    children: [],
    nodeType: 'body',
    lang: 'zh',
  };

  chunks.forEach((chunk, index) => {
    if (Array.isArray(chunk.hierarchy) && chunk.hierarchy.length > 0) {
      let currentNodes = roots;
      let path = '';
      chunk.hierarchy.forEach((title, idx) => {
        path = `${path}/${title}`;
        const level = Math.max(1, Math.min((idx + 1), 6));
        let node = currentNodes.find((item) => item.id === path);
        if (!node) {
          node = {
            id: path,
            title,
            level,
            chunkIds: [],
            children: [],
            nodeType: idx === chunk.hierarchy!.length - 1 ? chunk.nodeType : 'body',
            lang: chunk.lang,
          };
          currentNodes.push(node);
        }
        if (idx === chunk.hierarchy!.length - 1) {
          node.chunkIds.push(chunk.id);
          sectionByChunkId[chunk.id] = {id: node.id, title: node.title};
        }
        currentNodes = node.children;
      });
      return;
    }

    const heading = extractHeading(chunk.content);
    if (heading) {
      const node: OutlineNode = {
        id: `section-${chunk.id}`,
        title: heading.title,
        level: Math.max(1, Math.min(heading.level, 6)),
        chunkIds: [chunk.id],
        children: [],
        nodeType: chunk.nodeType,
        lang: chunk.lang,
      };

      while (stack.length && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        roots.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }
      stack.push(node);
      sectionByChunkId[chunk.id] = {id: node.id, title: node.title};
      return;
    }

    const active = stack[stack.length - 1];
    if (active) {
      active.chunkIds.push(chunk.id);
      sectionByChunkId[chunk.id] = {id: active.id, title: active.title};
      return;
    }

    fallbackNode.chunkIds.push(chunk.id);
    sectionByChunkId[chunk.id] = {id: fallbackNode.id, title: fallbackNode.title};
    if (!roots.find((node) => node.id === fallbackNode.id)) {
      roots.push(fallbackNode);
    }

    if (index === 0 && !chunks.some((item) => extractHeading(item.content))) {
      fallbackNode.title = `${fallbackPrefix} 1`;
    }
  });

  return {roots, sectionByChunkId};
}

function collectChunkIds(node: OutlineNode): string[] {
  return [...node.chunkIds, ...node.children.flatMap(collectChunkIds)];
}

function sectionIcon(nodeType?: Chunk['nodeType']) {
  switch (nodeType) {
    case 'abstract':
      return '📌';
    case 'preface':
    case 'intro':
      return '📖';
    case 'appendix':
      return '📎';
    case 'ref':
      return '📄';
    default:
      return '📚';
  }
}

function shortenSectionTitle(title: string, maxLen = 18) {
  const normalized = title.replace(/\s+/g, ' ').trim();
  if (!normalized) return '-';
  const chars = Array.from(normalized);
  if (chars.length <= maxLen) return normalized;
  return `${chars.slice(0, maxLen).join('')}...`;
}

export function DocumentDetailPanel({
  isDarkTheme,
  locale,
  details,
  highlightedChunkId = null,
  highlightedChunkIndex = null,
  onSaveDescription,
  onBack,
  onOpenSettings,
  onRechunk,
  onExportChunks,
}: DocumentDetailPanelProps) {
  const highlightedRef = useRef<HTMLDivElement | null>(null);
  const chunkRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const manualSectionLockUntilRef = useRef(0);
  const [focusedChunkId, setFocusedChunkId] = useState<string | null>(highlightedChunkId);
  const [descriptionDraft, setDescriptionDraft] = useState(details.description || '');
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);

  const outline = useMemo(
    () => buildOutline(details.chunks || [], locale.detailSectionPrefix),
    [details.chunks, locale.detailSectionPrefix],
  );

  const totalChars = useMemo(
    () => (details.chunks || []).reduce((sum, chunk) => sum + chunk.content.length, 0),
    [details.chunks],
  );

  useEffect(() => {
    setDescriptionDraft(details.description || '');
  }, [details.id, details.description]);

  useEffect(() => {
    if (highlightedChunkId) {
      setFocusedChunkId(highlightedChunkId);
      const section = outline.sectionByChunkId[highlightedChunkId];
      setActiveSectionId(section?.id ?? null);
      return;
    }
    if (highlightedChunkIndex !== null && highlightedChunkIndex !== undefined) {
      const target = details.chunks?.find((chunk) => chunk.index === highlightedChunkIndex);
      setFocusedChunkId(target?.id ?? null);
      if (target?.id) {
        const section = outline.sectionByChunkId[target.id];
        setActiveSectionId(section?.id ?? null);
      }
    }
  }, [highlightedChunkId, highlightedChunkIndex, details.chunks, outline.sectionByChunkId]);

  useEffect(() => {
    if (highlightedRef.current) {
      highlightedRef.current.scrollIntoView?.({behavior: 'smooth', block: 'center'});
    }
  }, [focusedChunkId, details.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') return;
    const nodes = Object.entries(chunkRefs.current)
      .map(([, value]) => value)
      .filter((item): item is HTMLDivElement => Boolean(item));
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < manualSectionLockUntilRef.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => {
            const aTop = Math.abs(a.boundingClientRect.top - 180);
            const bTop = Math.abs(b.boundingClientRect.top - 180);
            if (aTop !== bTop) return aTop - bTop;
            return b.intersectionRatio - a.intersectionRatio;
          })[0];
        if (!visible) return;
        const chunkId = (visible.target as HTMLElement).dataset.chunkId;
        if (!chunkId) return;
        const section = outline.sectionByChunkId[chunkId];
        if (section?.id) setActiveSectionId(section.id);
      },
      { threshold: [0.35, 0.6] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [details.id, outline.sectionByChunkId]);

  const handleDescriptionBlur = () => {
    const normalized = descriptionDraft.trim();
    if (normalized === (details.description || '').trim()) return;
    onSaveDescription(normalized);
  };

  const jumpToSection = (node: OutlineNode) => {
    const ids = collectChunkIds(node);
    if (!ids.length) return;
    manualSectionLockUntilRef.current = Date.now() + 1400;
    setActiveSectionId(node.id);
    setFocusedChunkId(ids[0]);
    const target = chunkRefs.current[ids[0]];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const downloadChunks = () => {
    const payload = details.chunks.map((chunk) => `# Chunk ${chunk.index + 1}\n\n${chunk.content}`).join('\n\n');
    const blob = new Blob([payload], {type: 'text/plain;charset=utf-8'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${details.name.replace(/\.[^.]+$/, '')}-chunks.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const shareDocument = async () => {
    const text = `${details.name} · ${(details.size / 1024 / 1024).toFixed(2)}MB · ${details.chunkCount}${locale.previewMetaChunks}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // noop
    }
  };

  const renderOutline = (nodes: OutlineNode[], depth = 0) => nodes.map((node) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = !!collapsedSections[node.id];
    const chunkTotal = collectChunkIds(node).length;
    const isActive = activeSectionId === node.id;

    return (
      <div key={node.id}>
        <div className={cn('group relative flex items-center gap-1 rounded-lg', isActive && (isDarkTheme ? 'bg-sky-900/40' : 'bg-blue-50'))} style={{paddingLeft: `${depth * 14 + 8}px`}}>
          {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-[#1677FF]" />}
          <button
            type="button"
            onClick={() => hasChildren && setCollapsedSections((prev) => ({...prev, [node.id]: !prev[node.id]}))}
            className={cn('p-1 rounded', hasChildren ? '' : 'opacity-40 cursor-default')}
            aria-label={hasChildren ? (isCollapsed ? 'expand section' : 'collapse section') : 'leaf section'}
          >
            {hasChildren ? (isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />) : <ChevronRight size={14} />}
          </button>
          <button
            type="button"
            onClick={() => jumpToSection(node)}
            className={cn(
              'flex-1 min-w-0 text-left py-2 pr-2 text-sm rounded-md transition-colors flex items-center gap-2 whitespace-nowrap',
              isDarkTheme ? 'text-slate-200 hover:bg-slate-800' : 'text-gray-700 hover:bg-blue-50',
            )}
          >
            <span className="inline-flex items-center gap-1 min-w-0 flex-1 overflow-hidden align-middle" title={node.title}>
              <span>{sectionIcon(node.nodeType)}</span>
              <span className="truncate">{shortenSectionTitle(node.title)}</span>
            </span>
            <span className={cn('ml-1 text-xs align-middle shrink-0 whitespace-nowrap', isDarkTheme ? 'text-slate-400' : 'text-gray-500')}>[{chunkTotal}块]</span>
          </button>
        </div>
        {!isCollapsed && hasChildren && <div className="mt-1">{renderOutline(node.children, depth + 1)}</div>}
      </div>
    );
  });

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${isDarkTheme ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <div className={`h-14 border-b flex items-center justify-between px-6 shrink-0 ${isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
        <button
          type="button"
          onClick={onBack}
          className={`flex items-center gap-2 transition-colors font-medium text-sm ${isDarkTheme ? 'text-slate-300 hover:text-sky-300' : 'text-gray-600 hover:text-blue-600'}`}
        >
          <ArrowLeft size={18} /> {locale.backToDocs}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={`p-2 rounded-full transition-colors ${isDarkTheme ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
          aria-label={locale.tabSettings}
        >
          <Settings size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        <div className="max-w-[1720px] mx-auto h-full grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)_300px]">
          <aside className={cn('rounded-lg border p-4 sticky top-6 self-start h-[calc(100vh-7rem)] min-h-[560px] overflow-auto', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200')}>
            <h3 className={cn('text-sm font-semibold mb-3', isDarkTheme ? 'text-slate-100' : 'text-gray-800')}>{locale.detailOutlineTitle}</h3>
            <div className="space-y-1">
              {outline.roots.length > 0 ? renderOutline(outline.roots) : <p className={cn('text-sm', isDarkTheme ? 'text-slate-400' : 'text-gray-400')}>{locale.detailNoOutline}</p>}
            </div>
          </aside>

          <section className={cn('relative rounded-lg border h-[calc(100vh-7rem)] overflow-auto', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200')}>
            <div className={cn('sticky top-0 z-20 px-4 pt-2 pb-3 border-b min-h-[74px] flex flex-col justify-center', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-100')}>
              <h2 className={cn('text-xl font-semibold', isDarkTheme ? 'text-slate-100' : 'text-gray-900')}>{details.name}</h2>
              <p className={cn('text-xs mt-1', isDarkTheme ? 'text-slate-400' : 'text-gray-500')}>{locale.detailChunkHint}</p>
            </div>
            <div className="space-y-3 px-4 pb-4 pt-3">
              {details.chunks?.map((chunk) => {
                const isHighlighted = focusedChunkId === chunk.id;
                const isExpanded = !!expandedChunks[chunk.id];
                const section = outline.sectionByChunkId[chunk.id];
                const summary = summarize(chunk.content);

                return (
                  <div
                    key={chunk.id}
                    ref={(node) => {
                      chunkRefs.current[chunk.id] = node;
                      if (isHighlighted) highlightedRef.current = node;
                    }}
                    data-chunk-id={chunk.id}
                    data-testid={`detail-chunk-${chunk.id}`}
                    className={cn(
                      'rounded-lg border p-4 transition-all shadow-sm',
                      isDarkTheme ? 'bg-slate-800 border-slate-700 hover:border-sky-400' : 'bg-[#F8F9FA] border-gray-200 hover:border-[#1677FF]',
                      isHighlighted && (isDarkTheme ? 'ring-2 ring-sky-300 border-sky-400' : 'ring-2 ring-[#1677FF]/30 border-[#1677FF]'),
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-[#1677FF] text-white">Chunk #{chunk.index + 1}</span>
                      <span
                        className={cn('text-xs px-2 py-0.5 rounded border max-w-[220px] truncate', isDarkTheme ? 'text-slate-200 border-slate-600' : 'text-gray-700 border-gray-300')}
                        title={(chunk.hierarchy ?? []).join(' / ') || section?.title || '-'}
                      >
                        {shortenSectionTitle((chunk.hierarchy ?? []).slice(-1)[0] ?? section?.title ?? '-', 18)}
                      </span>
                      <span className={cn('text-xs px-2 py-0.5 rounded border', isDarkTheme ? 'text-slate-200 border-slate-600' : 'text-gray-700 border-gray-300')}>
                        Token {chunk.tokenCount ?? '-'}
                      </span>
                      <span className={cn('text-xs px-2 py-0.5 rounded border', isDarkTheme ? 'text-slate-200 border-slate-600' : 'text-gray-700 border-gray-300')}>
                        P{chunk.pageStart ?? '-'}-{chunk.pageEnd ?? '-'}
                      </span>
                      <span className={cn('text-xs px-2 py-0.5 rounded border uppercase', isDarkTheme ? 'text-slate-200 border-slate-600' : 'text-gray-700 border-gray-300')}>
                        {chunk.lang ?? '-'}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(chunk.content);
                            setCopiedChunkId(chunk.id);
                            window.setTimeout(() => {
                              setCopiedChunkId((current) => (current === chunk.id ? null : current));
                            }, 1500);
                          } catch {
                            // noop
                          }
                        }}
                        className={cn('ml-auto inline-flex items-center gap-1 text-xs', isDarkTheme ? 'text-slate-300 hover:text-sky-300' : 'text-gray-500 hover:text-blue-600')}
                      >
                        <Copy size={12} /> {locale.detailCopyAction ?? '复制'}
                      </button>
                      {copiedChunkId === chunk.id && (
                        <span className={cn('text-xs px-2 py-0.5 rounded-md border', isDarkTheme ? 'text-emerald-300 border-emerald-700' : 'text-emerald-600 border-emerald-200 bg-emerald-50')}>
                          {locale.detailCopySuccess ?? '复制成功'}
                        </span>
                      )}
                    </div>

                    <p className={cn('text-xs mb-2 truncate', isDarkTheme ? 'text-slate-400' : 'text-gray-500')}>
                      {(locale.detailSummaryLabel ?? '摘要')}: {summary}
                    </p>

                    <div className={cn('overflow-hidden transition-all duration-300', isExpanded ? 'max-h-[960px]' : 'max-h-32')}>
                      <p className={cn('text-sm leading-6 whitespace-pre-wrap', !isExpanded && 'line-clamp-6', isDarkTheme ? 'text-slate-100' : 'text-gray-700')}>
                        {chunk.content}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedChunks((prev) => ({...prev, [chunk.id]: !prev[chunk.id]}))}
                      className={cn('mt-2 text-xs inline-flex items-center gap-1', isDarkTheme ? 'text-sky-300' : 'text-[#1677FF]')}
                    >
                      {isExpanded ? (locale.detailCollapse ?? '收起') : locale.detailExpand}
                      <ChevronDown size={12} className={cn('transition-transform', isExpanded && 'rotate-180')} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className={cn('rounded-lg border p-4 h-fit sticky top-6', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200')}>
            <h3 className={cn('text-sm font-semibold mb-3', isDarkTheme ? 'text-slate-100' : 'text-gray-800')}>{locale.detailInfoTitle ?? '文档信息'}</h3>
            <div className="space-y-2 text-sm mb-4">
              <p className={cn(isDarkTheme ? 'text-slate-300' : 'text-gray-600')}><span className="font-medium">{locale.detailInfoSize ?? '大小'}:</span> {(details.size / 1024 / 1024).toFixed(2)} MB</p>
              <p className={cn(isDarkTheme ? 'text-slate-300' : 'text-gray-600')}><span className="font-medium">{locale.detailInfoType ?? '类型'}:</span> {details.type}</p>
              <p className={cn(isDarkTheme ? 'text-slate-300' : 'text-gray-600')}><span className="font-medium">{locale.detailInfoUploadTime ?? '上传时间'}:</span> {details.uploadTime ? format(new Date(details.uploadTime), 'yyyy-MM-dd HH:mm') : '-'}</p>
              <p className={cn(isDarkTheme ? 'text-slate-300' : 'text-gray-600')}><span className="font-medium">{locale.detailInfoChunkCount ?? '分块总数'}:</span> {details.chunkCount}</p>
              <p className={cn(isDarkTheme ? 'text-slate-300' : 'text-gray-600')}><span className="font-medium">{locale.detailInfoCharCount ?? '字数统计'}:</span> {totalChars}</p>
              <p className={cn(isDarkTheme ? 'text-slate-300' : 'text-gray-600')}><span className="font-medium">切块策略:</span> {details.chunkingStrategy ?? '-'}</p>
              <p className={cn(isDarkTheme ? 'text-slate-300' : 'text-gray-600')}><span className="font-medium">重叠长度:</span> {details.overlapLength ?? 0}</p>
              <p className={cn(isDarkTheme ? 'text-slate-300' : 'text-gray-600')}><span className="font-medium">嵌入模型:</span> {details.embeddingModel ?? '-'}</p>
              <p className={cn(isDarkTheme ? 'text-slate-300' : 'text-gray-600')}><span className="font-medium">解析状态:</span> {details.parseStatus ?? '-'}</p>
              <p className={cn(isDarkTheme ? 'text-slate-300' : 'text-gray-600')}><span className="font-medium">向量化状态:</span> {details.vectorStatus ?? '-'}</p>
            </div>

            <div className="space-y-2 mb-4">
              <button type="button" onClick={downloadChunks} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#1677FF] text-white py-2 text-sm font-medium hover:bg-[#0f63d8] transition-colors">
                <Download size={14} /> {locale.detailDownloadAction ?? '下载'}
              </button>
              <button type="button" onClick={shareDocument} className={cn('w-full inline-flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors', isDarkTheme ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50')}>
                <Share2 size={14} /> {locale.detailShareAction ?? '分享'}
              </button>
              <button type="button" onClick={() => window.print()} className={cn('w-full inline-flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors', isDarkTheme ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50')}>
                <Printer size={14} /> {locale.detailPrintAction ?? '打印'}
              </button>
              <button type="button" onClick={onRechunk} className={cn('w-full inline-flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors', isDarkTheme ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50')}>
                重新切块
              </button>
              <button type="button" onClick={onExportChunks} className={cn('w-full inline-flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors', isDarkTheme ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50')}>
                导出分块
              </button>
            </div>

            <div>
              <label className={cn('block text-xs font-semibold uppercase mb-1', isDarkTheme ? 'text-slate-300' : 'text-gray-500')}>{locale.detailDescriptionLabel}</label>
              <textarea
                className={cn('w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none resize-none transition-colors', isDarkTheme ? 'border-slate-700 text-slate-100 bg-slate-800 hover:bg-slate-700' : 'border-gray-200 text-gray-700 bg-gray-50 hover:bg-white')}
                rows={4}
                placeholder={locale.detailDescriptionPlaceholder}
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={handleDescriptionBlur}
              ></textarea>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
