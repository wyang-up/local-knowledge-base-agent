import {Bot, File, Loader2, MoreHorizontal, Pin, Plus, Search, Send, UploadCloud, User} from 'lucide-react';
import {useState} from 'react';
import type {RefObject} from 'react';
import {cn} from '../../../shared/lib/utils';
import type {Conversation, Message, MessageSource} from '../../../shared/types';
import {formatRelativeTime, getConversationDisplayTitle} from '../lib/conversation';

type QALocale = {
  tabDocs: string;
  colActions: string;
  qaConversations: string;
  qaSearchPlaceholder: string;
  qaTagAll: string;
  qaNoConversationResult: string;
  qaMenuRename: string;
  qaMenuPin: string;
  qaMenuUnpin: string;
  qaMenuArchive: string;
  qaMenuUnarchive: string;
  qaMenuAddTag: string;
  qaMenuDelete: string;
  qaNewConversation: string;
  qaDefaultConversation: string;
  qaEmptyHint: string;
  qaStarterPrompts: string[];
  qaSourcePrefix: string;
  qaSourceSectionTitle: string;
  qaSourceExpand: string;
  qaSourceCollapse: string;
  qaSourceUnknownDoc: string;
  qaThinking: string;
  qaUploadAttachment: string;
  qaDragHint: string;
  qaInputPlaceholder: string;
  qaTitlePlaceholder: string;
  qaVectorStatus: string;
  qaLlmStatus: string;
  qaMcpStatusStreaming: string;
  qaMcpStatusIdle: string;
};

type QAPagePanelProps = {
  isDarkTheme: boolean;
  language: 'zh' | 'en';
  locale: QALocale;
  activeConversationId: string;
  qaSearch: string;
  qaTagFilter: string;
  activeConversationTitle: string;
  allTags: string[];
  visibleConversations: Conversation[];
  activeMenuConversationId: string;
  qaMessages: Message[];
  qaLoading: boolean;
  qaInput: string;
  qaAttachedFiles: File[];
  llmModel: string;
  hasActiveConversation: boolean;
  qaFileInputRef: RefObject<HTMLInputElement | null>;
  qaScrollRef: RefObject<HTMLDivElement | null>;
  onSetQaSearch: (value: string) => void;
  onSetQaTagFilter: (value: string) => void;
  onUpdateActiveConversationTitle: (title: string) => void;
  onSelectConversation: (id: string) => void;
  onToggleConversationMenu: (id: string) => void;
  onRenameConversation: (id: string) => void;
  onTogglePinConversation: (id: string) => void;
  onToggleArchiveConversation: (id: string) => void;
  onAddTagToConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onCreateNewConversation: () => void;
  onSetQaInput: (value: string) => void;
  onRemoveAttachedFile: (index: number) => void;
  onHandleQAFileUpload: (files: FileList) => void;
  onOpenSource: (source: MessageSource) => void;
  onSend: () => void;
};

export function QAPagePanel({
  isDarkTheme,
  language,
  locale,
  activeConversationId,
  qaSearch,
  qaTagFilter,
  activeConversationTitle,
  allTags,
  visibleConversations,
  activeMenuConversationId,
  qaMessages,
  qaLoading,
  qaInput,
  qaAttachedFiles,
  llmModel,
  hasActiveConversation,
  qaFileInputRef,
  qaScrollRef,
  onSetQaSearch,
  onSetQaTagFilter,
  onUpdateActiveConversationTitle: _onUpdateActiveConversationTitle,
  onSelectConversation,
  onToggleConversationMenu,
  onRenameConversation,
  onTogglePinConversation,
  onToggleArchiveConversation,
  onAddTagToConversation,
  onDeleteConversation,
  onCreateNewConversation,
  onSetQaInput,
  onRemoveAttachedFile,
  onHandleQAFileUpload,
  onOpenSource,
  onSend,
}: QAPagePanelProps) {
  const QA_TAG_ALL = '__all__';
  const [expandedSourceMessageIds, setExpandedSourceMessageIds] = useState<Record<string, boolean>>({});
  const [hoveredSourceKey, setHoveredSourceKey] = useState<string | null>(null);

  const getMessageId = (message: Message, index: number) => message.id || `qa-msg-${index}`;

  const toggleSourceExpand = (message: Message, index: number) => {
    const messageId = getMessageId(message, index);
    setExpandedSourceMessageIds((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  return (
    <div data-testid="qa-page-surface" className={cn('flex-1 flex overflow-hidden', isDarkTheme ? 'bg-slate-950' : 'bg-white')}>
      <div className={cn('w-[320px] border-r flex flex-col shrink-0', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-200')}>
        <div className={cn('p-4 border-b', isDarkTheme ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white')}>
          <h2 className={cn('font-bold', isDarkTheme ? 'text-slate-100' : 'text-gray-800')}>{locale.qaConversations}</h2>
          <div className="mt-3 relative">
            <Search size={14} className={cn('absolute left-3 top-1/2 -translate-y-1/2', isDarkTheme ? 'text-slate-400' : 'text-gray-400')} />
            <input
              placeholder={locale.qaSearchPlaceholder}
              value={qaSearch}
              onChange={(e) => onSetQaSearch(e.target.value)}
              className={cn('w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300', isDarkTheme ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-400' : 'bg-gray-50 border-gray-200 text-gray-700')}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[QA_TAG_ALL, ...allTags].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSetQaTagFilter(tag)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border transition-colors',
                  qaTagFilter === tag
                    ? 'bg-blue-600 text-white border-blue-600'
                    : (isDarkTheme ? 'bg-slate-900 text-slate-300 border-slate-600 hover:border-sky-400 hover:text-sky-300' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-200 hover:text-blue-600'),
                )}
                aria-label={tag === QA_TAG_ALL ? locale.qaTagAll : tag}
              >
                {tag === QA_TAG_ALL ? locale.qaTagAll : tag}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {visibleConversations.length === 0 && (
            <div className={cn('text-xs p-3 border border-dashed rounded-lg', isDarkTheme ? 'text-slate-400 border-slate-600 bg-slate-800/50' : 'text-gray-400 border-gray-200 bg-white')}>
              {locale.qaNoConversationResult}
            </div>
          )}
          {visibleConversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <div
                key={conversation.id}
                className={cn(
                  'group relative rounded-xl cursor-pointer transition-all border overflow-visible',
                  isActive
                    ? 'bg-blue-600 border-blue-600 shadow-sm'
                    : (isDarkTheme ? 'bg-slate-900 border-slate-700 hover:border-sky-400 hover:shadow-sm' : 'bg-white border-gray-200 hover:border-blue-200 hover:shadow-sm'),
                )}
                onClick={() => onSelectConversation(conversation.id)}
              >
                <div className={cn('absolute left-0 top-2 bottom-2 w-1 rounded-r-full', isActive ? 'bg-white' : 'bg-transparent group-hover:bg-blue-200')}></div>
                <div className="flex gap-3 p-3 pl-4">
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', isActive ? 'bg-white/20 text-white' : (isDarkTheme ? 'bg-slate-800 text-sky-300' : 'bg-blue-100 text-blue-600'))}>
                    <User size={16} />
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn('text-sm truncate', isActive ? 'font-semibold text-white' : (isDarkTheme ? 'text-slate-100' : 'text-gray-700'))}>{getConversationDisplayTitle(conversation.title, locale.qaNewConversation, locale.qaDefaultConversation)}</p>
                      {conversation.pinned && <Pin size={12} className={cn(isActive ? 'text-blue-100' : 'text-blue-500')} />}
                    </div>
                    <p className={cn('text-xs mt-1', isActive ? 'text-blue-100' : (isDarkTheme ? 'text-slate-400' : 'text-gray-400'))}>{formatRelativeTime(conversation.updatedAt, language)}</p>
                    {conversation.tags && conversation.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {conversation.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className={cn('text-[10px] px-1.5 py-0.5 rounded', isActive ? 'bg-white/20 text-blue-50' : (isDarkTheme ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-500'))}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleConversationMenu(conversation.id);
                      }}
                      className={cn(
                        'p-1.5 rounded-md transition-colors',
                        isActive ? 'text-blue-100 hover:bg-white/20' : (isDarkTheme ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'),
                        activeMenuConversationId === conversation.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                      )}
                      aria-label={`${locale.colActions}-${getConversationDisplayTitle(conversation.title, locale.qaNewConversation, locale.qaDefaultConversation)}`}
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {activeMenuConversationId === conversation.id && (
                      <div className={cn('absolute right-0 top-8 z-20 w-36 border shadow-lg rounded-lg p-1', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200')} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className={cn('w-full text-left text-xs px-2.5 py-1.5 rounded', isDarkTheme ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-gray-50')} onClick={() => onRenameConversation(conversation.id)}>{locale.qaMenuRename}</button>
                        <button type="button" className={cn('w-full text-left text-xs px-2.5 py-1.5 rounded', isDarkTheme ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-gray-50')} onClick={() => onTogglePinConversation(conversation.id)}>{conversation.pinned ? locale.qaMenuUnpin : locale.qaMenuPin}</button>
                        <button type="button" className={cn('w-full text-left text-xs px-2.5 py-1.5 rounded', isDarkTheme ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-gray-50')} onClick={() => onToggleArchiveConversation(conversation.id)}>{conversation.archived ? locale.qaMenuUnarchive : locale.qaMenuArchive}</button>
                        <button type="button" className={cn('w-full text-left text-xs px-2.5 py-1.5 rounded', isDarkTheme ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-gray-50')} onClick={() => onAddTagToConversation(conversation.id)}>{locale.qaMenuAddTag}</button>
                        <button type="button" className={cn('w-full text-left text-xs px-2.5 py-1.5 rounded text-red-600', isDarkTheme ? 'hover:bg-red-900/40' : 'hover:bg-red-50')} onClick={() => onDeleteConversation(conversation.id)}>{locale.qaMenuDelete}</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className={cn('p-3 border-t', isDarkTheme ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white')}>
          <button type="button" onClick={onCreateNewConversation} className={cn('w-full inline-flex items-center justify-center gap-2 text-sm border py-2 rounded-lg transition-colors', isDarkTheme ? 'text-sky-300 border-sky-800 bg-sky-900/20 hover:bg-sky-900/40' : 'text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100')}>
            <Plus size={14} /> {locale.qaNewConversation}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative">
        <div className={cn('shrink-0 px-4 py-3 border-b', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-[#f5f7fa] border-gray-200')}>
          <div className={cn('rounded-lg px-3 py-2', isDarkTheme ? 'bg-slate-800' : 'bg-white')}>
            <p
              title={activeConversationTitle}
              className={cn('w-full truncate text-sm font-semibold text-center', isDarkTheme ? 'text-sky-300' : 'text-[#1677FF]')}
            >
              {activeConversationTitle || locale.qaNewConversation}
            </p>
          </div>
        </div>

        <div ref={qaScrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {qaMessages.length === 0 && (
            <div className={cn('max-w-2xl border border-dashed rounded-xl p-4', isDarkTheme ? 'border-sky-700 bg-sky-900/20' : 'border-blue-200 bg-blue-50/40')}>
              <p className={cn('text-sm', isDarkTheme ? 'text-slate-200' : 'text-gray-600')}>{locale.qaEmptyHint}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {locale.qaStarterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => onSetQaInput(prompt)}
                    className={cn('text-xs px-3 py-1.5 rounded-full border transition-colors', isDarkTheme ? 'bg-slate-900 border-sky-700 text-sky-200 hover:bg-slate-800' : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-100')}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {qaMessages.map((msg, idx) => {
            const messageId = getMessageId(msg, idx);
            const assistantSources = msg.role === 'assistant' ? (msg.sources ?? []) : [];
            const isSourceExpanded = expandedSourceMessageIds[messageId] === true;

            return (
            <div key={messageId} className={cn('flex gap-4 max-w-3xl', msg.role === 'user' ? 'ml-auto flex-row-reverse' : '')}>
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm', msg.role === 'user' ? 'bg-blue-600 text-white' : (isDarkTheme ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'))}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={18} />}
              </div>
              <div className={cn('flex flex-col gap-2', msg.role === 'user' ? 'items-end' : 'items-start')}>
                <div className={msg.role === 'user' ? 'p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap bg-[#1677FF] text-white' : cn('p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap shadow-sm', isDarkTheme ? 'bg-slate-900 border border-slate-700 text-slate-100' : 'bg-[#f5f7fa] border border-gray-200 text-gray-800')}>
                  {msg.content}
                </div>
                {assistantSources.length > 0 && (
                  <div className={cn('w-full rounded-lg border px-3 py-2 mt-1', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-200')}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('text-xs font-medium', isDarkTheme ? 'text-slate-200' : 'text-gray-700')}>{locale.qaSourceSectionTitle}</p>
                      <button
                        type="button"
                        onClick={() => toggleSourceExpand(msg, idx)}
                        className={cn('text-xs underline underline-offset-2', isDarkTheme ? 'text-sky-300 hover:text-sky-200' : 'text-blue-600 hover:text-blue-700')}
                      >
                        {isSourceExpanded ? locale.qaSourceCollapse : locale.qaSourceExpand}
                      </button>
                    </div>

                    {isSourceExpanded && (
                      <div className="mt-2 space-y-2">
                        {assistantSources.map((src, sourceIndex) => {
                          const chunkLabel = language === 'en'
                            ? `Chunk ${(src.chunkIndex ?? sourceIndex) + 1}`
                            : `第${(src.chunkIndex ?? sourceIndex) + 1}分块`;
                          const label = `${src.docName || locale.qaSourceUnknownDoc} - ${chunkLabel}`;
                          const sourceKey = `${messageId}-${src.chunkId ?? sourceIndex}`;
                          return (
                            <div key={sourceKey} className="relative">
                              <button
                                type="button"
                                title={src.content || ''}
                                onClick={() => onOpenSource(src)}
                                onMouseEnter={() => setHoveredSourceKey(sourceKey)}
                                onMouseLeave={() => setHoveredSourceKey((prev) => (prev === sourceKey ? null : prev))}
                                className={cn('w-full text-left inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors', isDarkTheme ? 'text-sky-200 bg-sky-900/30 hover:bg-sky-900/45 border-sky-800' : 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-100')}
                              >
                                <File size={12} /> {label}
                              </button>

                              {hoveredSourceKey === sourceKey && src.content && (
                                <div className={cn('absolute left-0 top-full mt-1 z-20 max-w-sm text-xs leading-relaxed px-2 py-1.5 rounded border shadow', isDarkTheme ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-gray-200 text-gray-700')}>
                                  {src.content}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            );
          })}
          {qaLoading && (
            <div className={cn('flex items-center gap-2 text-sm', isDarkTheme ? 'text-slate-300' : 'text-gray-400')}>
              <Loader2 size={16} className="animate-spin" /> {locale.qaThinking}
            </div>
          )}
        </div>

        <div className={cn('p-4 border-t', isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200')}>
          <div className={cn('max-w-4xl mx-auto flex flex-col gap-2 border rounded-xl focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 overflow-hidden shadow-sm transition-all', isDarkTheme ? 'border-slate-700 bg-slate-900' : 'border-gray-300 bg-white')}>
            <div className={cn('px-3 pt-2 pb-1 border-b flex items-center gap-2', isDarkTheme ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-100')}>
              <input type="file" ref={qaFileInputRef} data-testid="qa-upload-input" className="hidden" multiple onChange={(e) => e.target.files && onHandleQAFileUpload(e.target.files)} />
              <button type="button" onClick={() => qaFileInputRef.current?.click()} className={cn('text-xs font-medium flex items-center gap-1.5 border px-3 py-1.5 rounded-md shadow-sm transition-all', isDarkTheme ? 'text-slate-200 hover:text-sky-300 bg-slate-900 border-slate-600 hover:border-sky-500' : 'text-blue-700 hover:text-blue-800 bg-blue-50 border-blue-200 hover:border-blue-300')}>
                <UploadCloud size={14} /> {locale.qaUploadAttachment}
              </button>
              <span className={cn('text-xs', isDarkTheme ? 'text-slate-400' : 'text-gray-400')}>{locale.qaDragHint}</span>
              {qaAttachedFiles.length > 0 && (
                <div className="flex gap-1 ml-2">
                  {qaAttachedFiles.map((f, i) => (
                    <span key={i} className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded', isDarkTheme ? 'bg-slate-800 text-sky-200' : 'bg-blue-50 text-blue-600')}>
                      <File size={10} />{f.name}
                      <button type="button" onClick={() => onRemoveAttachedFile(i)} className="hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end gap-2 p-2">
              <textarea
                className={cn('flex-1 max-h-32 min-h-[44px] p-2 text-sm outline-none resize-none bg-transparent', isDarkTheme ? 'text-slate-100 placeholder:text-slate-400' : 'text-gray-700')}
                placeholder={locale.qaInputPlaceholder}
                value={qaInput}
                onChange={(e) => onSetQaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                rows={1}
              ></textarea>
              <button
                type="button"
                aria-label={language === 'en' ? 'Send' : '发送'}
                onClick={onSend}
                disabled={!qaInput.trim() || qaLoading || !hasActiveConversation}
                className="bg-[#1677FF] hover:bg-[#145dc2] text-white p-2.5 rounded-md shadow-sm transition-colors mb-0.5 disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className={cn('h-6 border-t flex items-center justify-between px-4 text-[11px]', isDarkTheme ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-gray-50 border-gray-200 text-gray-500')}>
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> {locale.qaVectorStatus}</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> {locale.qaLlmStatus} ({llmModel})</span>
          </div>
          <div className="flex items-center gap-1">
            <span
              data-testid="mcp-status-dot"
              className={cn('w-1.5 h-1.5 rounded-full', qaLoading ? 'bg-amber-500' : 'bg-green-500')}
            ></span>
            <span>{qaLoading ? locale.qaMcpStatusStreaming : locale.qaMcpStatusIdle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
