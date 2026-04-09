import {fireEvent, render, screen} from '@testing-library/react';
import {createRef} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {QAPagePanel} from './QAPagePanel';

describe('QAPagePanel', () => {
  it('renders QA surface and routes starter prompt action', () => {
    const setQaInput = vi.fn();

    render(
      <QAPagePanel
        isDarkTheme={false}
        language="zh"
        locale={{
          tabDocs: '文档库',
          colActions: '操作',
          qaConversations: '会话列表',
          qaSearchPlaceholder: '搜索会话或内容',
          qaTagAll: '全部',
          qaNoConversationResult: '没有匹配的会话',
          qaMenuRename: '重命名',
          qaMenuPin: '置顶会话',
          qaMenuUnpin: '取消置顶',
          qaMenuArchive: '归档会话',
          qaMenuUnarchive: '取消归档',
          qaMenuAddTag: '添加标签',
          qaMenuDelete: '删除会话',
          qaNewConversation: '新建会话',
          qaDefaultConversation: '默认会话',
          qaEmptyHint: '开始一个新会话吧',
          qaStarterPrompts: ['提示词A'],
          qaSourcePrefix: '源',
          qaSourceSectionTitle: '相关文档来源',
          qaSourceExpand: '展开溯源',
          qaSourceCollapse: '收起溯源',
          qaSourceUnknownDoc: '未知文档',
          qaThinking: 'AI 正在思考中...',
          qaUploadAttachment: '上传附件',
          qaDragHint: '拖拽上传',
          qaInputPlaceholder: '请输入问题',
          qaTitlePlaceholder: '编辑会话标题',
          qaVectorStatus: '向量检索: 待机',
          qaLlmStatus: 'LLM 连接: 正常',
          qaMcpStatusStreaming: '流式中',
          qaMcpStatusIdle: '空闲',
        }}
        activeConversationId="c1"
        qaSearch=""
        qaTagFilter="__all__"
        activeConversationTitle="新会话"
        allTags={[]}
        visibleConversations={[]}
        activeMenuConversationId=""
        qaMessages={[]}
        qaLoading={false}
        qaInput=""
        qaAttachedFiles={[]}
        llmModel="deepseek-ai/DeepSeek-V3"
        hasActiveConversation={true}
        qaFileInputRef={createRef<HTMLInputElement>()}
        qaScrollRef={createRef<HTMLDivElement>()}
        onSetQaSearch={vi.fn()}
        onSetQaTagFilter={vi.fn()}
        onUpdateActiveConversationTitle={vi.fn()}
        onSelectConversation={vi.fn()}
        onToggleConversationMenu={vi.fn()}
        onRenameConversation={vi.fn()}
        onTogglePinConversation={vi.fn()}
        onToggleArchiveConversation={vi.fn()}
        onAddTagToConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onCreateNewConversation={vi.fn()}
        onSetQaInput={setQaInput}
        onRemoveAttachedFile={vi.fn()}
        onHandleQAFileUpload={vi.fn()}
        onOpenSource={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByTestId('qa-page-surface')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: '提示词A'}));
    expect(setQaInput).toHaveBeenCalledWith('提示词A');
  });

  it('renders collapsible sources only for assistant messages', () => {
    render(
      <QAPagePanel
        isDarkTheme={false}
        language="zh"
        locale={{
          tabDocs: '文档库',
          colActions: '操作',
          qaConversations: '会话列表',
          qaSearchPlaceholder: '搜索会话或内容',
          qaTagAll: '全部',
          qaNoConversationResult: '没有匹配的会话',
          qaMenuRename: '重命名',
          qaMenuPin: '置顶会话',
          qaMenuUnpin: '取消置顶',
          qaMenuArchive: '归档会话',
          qaMenuUnarchive: '取消归档',
          qaMenuAddTag: '添加标签',
          qaMenuDelete: '删除会话',
          qaNewConversation: '新建会话',
          qaDefaultConversation: '默认会话',
          qaEmptyHint: '开始一个新会话吧',
          qaStarterPrompts: ['提示词A'],
          qaSourcePrefix: '源',
          qaSourceSectionTitle: '相关文档来源',
          qaSourceExpand: '展开溯源',
          qaSourceCollapse: '收起溯源',
          qaSourceUnknownDoc: '未知文档',
          qaThinking: 'AI 正在思考中...',
          qaUploadAttachment: '上传附件',
          qaDragHint: '拖拽上传',
          qaInputPlaceholder: '请输入问题',
          qaTitlePlaceholder: '编辑会话标题',
          qaVectorStatus: '向量检索: 待机',
          qaLlmStatus: 'LLM 连接: 正常',
          qaMcpStatusStreaming: '流式中',
          qaMcpStatusIdle: '空闲',
        }}
        activeConversationId="c1"
        qaSearch=""
        qaTagFilter="__all__"
        activeConversationTitle="新会话"
        allTags={[]}
        visibleConversations={[]}
        activeMenuConversationId=""
        qaMessages={[
          { id: 'm1', role: 'user', content: '用户问题', timestamp: '2026-04-03T00:00:00.000Z', sources: [{ docName: 'ignored.pdf', content: 'ignored' }] },
          { id: 'm2', role: 'assistant', content: 'AI回答', timestamp: '2026-04-03T00:00:01.000Z', sources: [{ docName: '销售报表.xlsx', content: '第三块内容预览' }] },
        ]}
        qaLoading={false}
        qaInput=""
        qaAttachedFiles={[]}
        llmModel="deepseek-ai/DeepSeek-V3"
        hasActiveConversation={true}
        qaFileInputRef={createRef<HTMLInputElement>()}
        qaScrollRef={createRef<HTMLDivElement>()}
        onSetQaSearch={vi.fn()}
        onSetQaTagFilter={vi.fn()}
        onUpdateActiveConversationTitle={vi.fn()}
        onSelectConversation={vi.fn()}
        onToggleConversationMenu={vi.fn()}
        onRenameConversation={vi.fn()}
        onTogglePinConversation={vi.fn()}
        onToggleArchiveConversation={vi.fn()}
        onAddTagToConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onCreateNewConversation={vi.fn()}
        onSetQaInput={vi.fn()}
        onRemoveAttachedFile={vi.fn()}
        onHandleQAFileUpload={vi.fn()}
        onOpenSource={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', {name: '展开溯源'})).toBeInTheDocument();
    expect(screen.queryByText('销售报表.xlsx-第1分块')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: '展开溯源'}));

    expect(screen.getByRole('button', {name: '销售报表.xlsx-第1分块'})).toBeInTheDocument();
    expect(screen.queryByText('ignored.pdf-第1分块')).not.toBeInTheDocument();
  });

  it('renders centered non-editable conversation title', () => {
    render(
      <QAPagePanel
        isDarkTheme={false}
        language="zh"
        locale={{
          tabDocs: '文档库',
          colActions: '操作',
          qaConversations: '会话列表',
          qaSearchPlaceholder: '搜索会话或内容',
          qaTagAll: '全部',
          qaNoConversationResult: '没有匹配的会话',
          qaMenuRename: '重命名',
          qaMenuPin: '置顶会话',
          qaMenuUnpin: '取消置顶',
          qaMenuArchive: '归档会话',
          qaMenuUnarchive: '取消归档',
          qaMenuAddTag: '添加标签',
          qaMenuDelete: '删除会话',
          qaNewConversation: '新会话',
          qaDefaultConversation: '默认会话',
          qaEmptyHint: '开始一个新会话吧',
          qaStarterPrompts: ['提示词A'],
          qaSourcePrefix: '源',
          qaSourceSectionTitle: '相关文档来源',
          qaSourceExpand: '展开溯源',
          qaSourceCollapse: '收起溯源',
          qaSourceUnknownDoc: '未知文档',
          qaThinking: 'AI 正在思考中...',
          qaUploadAttachment: '上传附件',
          qaDragHint: '拖拽上传',
          qaInputPlaceholder: '请输入问题',
          qaTitlePlaceholder: '编辑会话标题',
          qaVectorStatus: '向量检索: 待机',
          qaLlmStatus: 'LLM 连接: 正常',
          qaMcpStatusStreaming: '流式中',
          qaMcpStatusIdle: '空闲',
        }}
        activeConversationId="c1"
        qaSearch=""
        qaTagFilter="__all__"
        activeConversationTitle="旧标题"
        allTags={[]}
        visibleConversations={[]}
        activeMenuConversationId=""
        qaMessages={[]}
        qaLoading={false}
        qaInput=""
        qaAttachedFiles={[]}
        llmModel="deepseek-ai/DeepSeek-V3"
        hasActiveConversation={true}
        qaFileInputRef={createRef<HTMLInputElement>()}
        qaScrollRef={createRef<HTMLDivElement>()}
        onSetQaSearch={vi.fn()}
        onSetQaTagFilter={vi.fn()}
        onUpdateActiveConversationTitle={vi.fn()}
        onSelectConversation={vi.fn()}
        onToggleConversationMenu={vi.fn()}
        onRenameConversation={vi.fn()}
        onTogglePinConversation={vi.fn()}
        onToggleArchiveConversation={vi.fn()}
        onAddTagToConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onCreateNewConversation={vi.fn()}
        onSetQaInput={vi.fn()}
        onRemoveAttachedFile={vi.fn()}
        onHandleQAFileUpload={vi.fn()}
        onOpenSource={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('旧标题')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: '旧标题'})).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('编辑会话标题')).not.toBeInTheDocument();
  });

  it('shows source preview card on hover', () => {
    render(
      <QAPagePanel
        isDarkTheme={false}
        language="zh"
        locale={{
          tabDocs: '文档库',
          colActions: '操作',
          qaConversations: '会话列表',
          qaSearchPlaceholder: '搜索会话或内容',
          qaTagAll: '全部',
          qaNoConversationResult: '没有匹配的会话',
          qaMenuRename: '重命名',
          qaMenuPin: '置顶会话',
          qaMenuUnpin: '取消置顶',
          qaMenuArchive: '归档会话',
          qaMenuUnarchive: '取消归档',
          qaMenuAddTag: '添加标签',
          qaMenuDelete: '删除会话',
          qaNewConversation: '新会话',
          qaDefaultConversation: '默认会话',
          qaEmptyHint: '开始一个新会话吧',
          qaStarterPrompts: ['提示词A'],
          qaSourcePrefix: '源',
          qaSourceSectionTitle: '相关文档来源',
          qaSourceExpand: '展开溯源',
          qaSourceCollapse: '收起溯源',
          qaSourceUnknownDoc: '未知文档',
          qaThinking: 'AI 正在思考中...',
          qaUploadAttachment: '上传附件',
          qaDragHint: '拖拽上传',
          qaInputPlaceholder: '请输入问题',
          qaTitlePlaceholder: '编辑会话标题',
          qaVectorStatus: '向量检索: 待机',
          qaLlmStatus: 'LLM 连接: 正常',
          qaMcpStatusStreaming: '流式中',
          qaMcpStatusIdle: '空闲',
        }}
        activeConversationId="c1"
        qaSearch=""
        qaTagFilter="__all__"
        activeConversationTitle="新会话"
        allTags={[]}
        visibleConversations={[]}
        activeMenuConversationId=""
        qaMessages={[
          {
            id: 'm2',
            role: 'assistant',
            content: 'AI回答',
            timestamp: '2026-04-03T00:00:01.000Z',
            sources: [{ docId: 'doc-1', chunkId: 'chunk-1', chunkIndex: 0, docName: '销售报表.xlsx', content: '这是来源预览内容' }],
          },
        ]}
        qaLoading={false}
        qaInput=""
        qaAttachedFiles={[]}
        llmModel="deepseek-ai/DeepSeek-V3"
        hasActiveConversation={true}
        qaFileInputRef={createRef<HTMLInputElement>()}
        qaScrollRef={createRef<HTMLDivElement>()}
        onSetQaSearch={vi.fn()}
        onSetQaTagFilter={vi.fn()}
        onUpdateActiveConversationTitle={vi.fn()}
        onSelectConversation={vi.fn()}
        onToggleConversationMenu={vi.fn()}
        onRenameConversation={vi.fn()}
        onTogglePinConversation={vi.fn()}
        onToggleArchiveConversation={vi.fn()}
        onAddTagToConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onCreateNewConversation={vi.fn()}
        onSetQaInput={vi.fn()}
        onRemoveAttachedFile={vi.fn()}
        onHandleQAFileUpload={vi.fn()}
        onOpenSource={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: '展开溯源'}));
    fireEvent.mouseEnter(screen.getByRole('button', {name: /销售报表\.xlsx-第1分块/}));

    expect(screen.getByText('这是来源预览内容')).toBeInTheDocument();
  });

  it('keeps upload button on left side and send button icon-only', () => {
    render(
      <QAPagePanel
        isDarkTheme={false}
        language="zh"
        locale={{
          tabDocs: '文档库',
          colActions: '操作',
          qaConversations: '会话列表',
          qaSearchPlaceholder: '搜索会话或内容',
          qaTagAll: '全部',
          qaNoConversationResult: '没有匹配的会话',
          qaMenuRename: '重命名',
          qaMenuPin: '置顶会话',
          qaMenuUnpin: '取消置顶',
          qaMenuArchive: '归档会话',
          qaMenuUnarchive: '取消归档',
          qaMenuAddTag: '添加标签',
          qaMenuDelete: '删除会话',
          qaNewConversation: '新会话',
          qaDefaultConversation: '默认会话',
          qaEmptyHint: '开始一个新会话吧',
          qaStarterPrompts: ['提示词A'],
          qaSourcePrefix: '源',
          qaSourceSectionTitle: '相关文档来源',
          qaSourceExpand: '展开溯源',
          qaSourceCollapse: '收起溯源',
          qaSourceUnknownDoc: '未知文档',
          qaThinking: 'AI 正在思考中...',
          qaUploadAttachment: '上传附件',
          qaDragHint: '拖拽上传',
          qaInputPlaceholder: '请输入问题',
          qaTitlePlaceholder: '编辑会话标题',
          qaVectorStatus: '向量检索: 待机',
          qaLlmStatus: 'LLM 连接: 正常',
          qaMcpStatusStreaming: '流式中',
          qaMcpStatusIdle: '空闲',
        }}
        activeConversationId="c1"
        qaSearch=""
        qaTagFilter="__all__"
        activeConversationTitle="新会话"
        allTags={[]}
        visibleConversations={[]}
        activeMenuConversationId=""
        qaMessages={[]}
        qaLoading={false}
        qaInput="你好"
        qaAttachedFiles={[]}
        llmModel="deepseek-ai/DeepSeek-V3"
        hasActiveConversation={true}
        qaFileInputRef={createRef<HTMLInputElement>()}
        qaScrollRef={createRef<HTMLDivElement>()}
        onSetQaSearch={vi.fn()}
        onSetQaTagFilter={vi.fn()}
        onUpdateActiveConversationTitle={vi.fn()}
        onSelectConversation={vi.fn()}
        onToggleConversationMenu={vi.fn()}
        onRenameConversation={vi.fn()}
        onTogglePinConversation={vi.fn()}
        onToggleArchiveConversation={vi.fn()}
        onAddTagToConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onCreateNewConversation={vi.fn()}
        onSetQaInput={vi.fn()}
        onRemoveAttachedFile={vi.fn()}
        onHandleQAFileUpload={vi.fn()}
        onOpenSource={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', {name: '上传附件'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '发送'})).toBeInTheDocument();
    expect(screen.queryByText('发送')).not.toBeInTheDocument();
  });

  it('shows MCP status dot color by loading state', () => {
    const baseProps = {
      isDarkTheme: false,
      language: 'zh' as const,
      locale: {
        tabDocs: '文档库',
        colActions: '操作',
        qaConversations: '会话列表',
        qaSearchPlaceholder: '搜索会话或内容',
        qaTagAll: '全部',
        qaNoConversationResult: '没有匹配的会话',
        qaMenuRename: '重命名',
        qaMenuPin: '置顶会话',
        qaMenuUnpin: '取消置顶',
        qaMenuArchive: '归档会话',
        qaMenuUnarchive: '取消归档',
        qaMenuAddTag: '添加标签',
        qaMenuDelete: '删除会话',
        qaNewConversation: '新会话',
        qaDefaultConversation: '默认会话',
        qaEmptyHint: '开始一个新会话吧',
        qaStarterPrompts: ['提示词A'],
        qaSourcePrefix: '源',
        qaSourceSectionTitle: '相关文档来源',
        qaSourceExpand: '展开溯源',
        qaSourceCollapse: '收起溯源',
        qaSourceUnknownDoc: '未知文档',
        qaThinking: 'AI 正在思考中...',
        qaUploadAttachment: '上传附件',
        qaDragHint: '拖拽上传',
        qaInputPlaceholder: '请输入问题',
        qaTitlePlaceholder: '编辑会话标题',
        qaVectorStatus: '向量检索: 待机',
        qaLlmStatus: 'LLM 连接: 正常',
        qaMcpStatusStreaming: 'MCP 流式状态: 传输中',
        qaMcpStatusIdle: 'MCP 流式状态: 空闲',
      },
      activeConversationId: 'c1',
      qaSearch: '',
      qaTagFilter: '__all__',
      activeConversationTitle: '新会话',
      allTags: [],
      visibleConversations: [],
      activeMenuConversationId: '',
      qaMessages: [],
      qaInput: 'hi',
      qaAttachedFiles: [],
      llmModel: 'deepseek-ai/DeepSeek-V3',
      hasActiveConversation: true,
      qaFileInputRef: createRef<HTMLInputElement>(),
      qaScrollRef: createRef<HTMLDivElement>(),
      onSetQaSearch: vi.fn(),
      onSetQaTagFilter: vi.fn(),
      onUpdateActiveConversationTitle: vi.fn(),
      onSelectConversation: vi.fn(),
      onToggleConversationMenu: vi.fn(),
      onRenameConversation: vi.fn(),
      onTogglePinConversation: vi.fn(),
      onToggleArchiveConversation: vi.fn(),
      onAddTagToConversation: vi.fn(),
      onDeleteConversation: vi.fn(),
      onCreateNewConversation: vi.fn(),
      onSetQaInput: vi.fn(),
      onRemoveAttachedFile: vi.fn(),
      onHandleQAFileUpload: vi.fn(),
      onOpenSource: vi.fn(),
      onSend: vi.fn(),
    };

    const {rerender} = render(<QAPagePanel {...baseProps} qaLoading={false} />);
    expect(screen.getByTestId('mcp-status-dot').className).toContain('bg-green-500');

    rerender(<QAPagePanel {...baseProps} qaLoading={true} />);
    expect(screen.getByTestId('mcp-status-dot').className).toContain('bg-amber-500');
  });
});
