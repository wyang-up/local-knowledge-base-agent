import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  getSettingsSecurityHeaders,
  SETTINGS_CSRF_HEADER,
  SETTINGS_SESSION_HEADER,
} from '../../features/settings/useSettingsPageController';

const QA_STORAGE_KEY = 'kb.qa.conversations.v1';
const BOOTSTRAP_SESSION_TOKEN = 'bootstrap-session-token';
const BOOTSTRAP_CSRF_TOKEN = 'bootstrap-csrf-token';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function hasRequiredSettingsHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers);
  return (
    Boolean(headers.get('x-settings-session'))
    && Boolean(headers.get('x-csrf-token'))
  );
}

const documentsResponse = [
  {
    id: 'doc-1',
    name: '失败文档.pdf',
    size: 1024,
    type: '.pdf',
    uploadTime: '2026-03-30T00:00:00.000Z',
    status: 'failed',
    chunkCount: 0,
    description: '',
    currentStage: 'embedding',
    jobStatus: 'failed',
    stageProgress: 40,
    overallProgress: 72,
    processedUnits: 4,
    totalUnits: 10,
    retryCount: 1,
    resumeEligible: true,
    resumeInvalidReason: 'source-md5-changed',
    message: 'waiting-for-resources',
    errorCode: 'PARSING_FAILED',
    errorMessage: 'pipeline failed',
  },
];

const detailResponse = {
  ...documentsResponse[0],
  chunks: [
    { id: 'chunk-1', docId: 'doc-1', index: 0, content: '预览内容' },
  ],
};

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    let storage: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => (key in storage ? storage[key] : null),
        setItem: (key: string, value: string) => {
          storage[key] = String(value);
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
        clear: () => {
          storage = {};
        },
      },
    });
    vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const pathname = new URL(url, 'http://localhost').pathname;

      if (pathname === '/api/settings/preview-flags') {
        return new Response(JSON.stringify({
          enableNewPreviewModal: true,
          enableNewPreviewByType: {pdf: true},
        }), { status: 200 });
      }

      if (pathname === '/api/documents/doc-1/content') {
        return new Response(JSON.stringify({
          mimeType: 'application/pdf',
          content: {src: 'blob:https://example.com/doc-1.pdf'},
          totalPages: 3,
        }), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }

      if (pathname === '/api/documents/doc-1') {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }

      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }

      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }

      if (url.includes('/api/ollama/models')) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }

      if (url.includes('/api/siliconflow/models')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
          documentStoragePath: './data/uploads',
          readOnly: true,
          hasApiKey: false,
        }), { status: 200 });
      }

      if (url.includes('/api/settings/auth/bootstrap') && init?.method === 'GET') {
        return new Response(JSON.stringify({
          sessionToken: BOOTSTRAP_SESSION_TOKEN,
          csrfToken: BOOTSTRAP_CSRF_TOKEN,
        }), { status: 200 });
      }

      if (url.includes('/api/config/apikey') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (url.includes('/api/config/ui') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (url.includes('/api/config/provider/') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({
          models: [
            {
              modelId: 'remote-llm-1',
              displayName: 'Remote LLM 1',
              modelType: 'llm',
              description: '来自远端模型目录',
              isOnline: true,
              lastCheckedAt: '2026-04-01T10:00:00.000Z',
            },
            {
              modelId: 'remote-embed-1',
              displayName: 'Remote Embed 1',
              modelType: 'embedding',
              description: 'Embedding 可用',
              isOnline: false,
              lastCheckedAt: '2026-04-01T10:00:00.000Z',
            },
          ],
          source: 'remote',
          isStale: false,
        }), { status: 200 });
      }

      if (/\/api\/config\/provider\/.+\/test/.test(url) && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (/\/api\/config\/provider\/.+\/key-token/.test(url) && init?.method === 'POST') {
        return new Response(JSON.stringify({ token: 'secure-token', expiresAt: '2026-04-01T10:00:00.000Z' }), { status: 200 });
      }

      if (/\/api\/config\/provider\/.+\/key-reveal/.test(url) && init?.method === 'POST') {
        return new Response(JSON.stringify({ plainKey: 'sk-test-123456' }), { status: 200 });
      }

      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({
          ui: { language: 'zh', theme: 'light' },
          providers: [
            {
              providerId: 'siliconflow',
              version: 1,
              baseUrl: 'https://api.siliconflow.cn/v1',
              llmModel: 'deepseek-ai/DeepSeek-V3',
              embeddingModel: 'BAAI/bge-m3',
              hasKey: true,
              maskedKey: 'sk-***',
              updatedAt: '2026-04-01T10:00:00.000Z',
              lastModelSyncAt: null,
            },
          ],
          storage: {
            version: 1,
            storagePath: './data/lance',
            documentStoragePath: './data/uploads',
            platform: 'win32',
            cacheSizeBytes: 2048,
            freeSpaceBytes: 8 * 1024 * 1024,
            updatedAt: '2026-04-01T10:00:00.000Z',
          },
        }), { status: 200 });
      }

      if (url.includes('/api/storage/open') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          openedPath: './data/lance',
          openedInSystem: true,
          stats: { cacheSizeBytes: 4096, freeSpaceBytes: 16 * 1024 * 1024 },
        }), { status: 200 });
      }

      if (url.includes('/api/storage/docs/open') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          openedPath: './data/uploads',
          openedInSystem: true,
          stats: { cacheSizeBytes: 1024, freeSpaceBytes: 16 * 1024 * 1024 },
        }), { status: 200 });
      }

      if (url.includes('/api/storage/cache/clear') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          reclaimedBytes: 1024,
          stats: { cacheSizeBytes: 0, freeSpaceBytes: 16 * 1024 * 1024 },
        }), { status: 200 });
      }

      if (url.includes('/api/config/storage') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (url.includes('/api/config/export') && init?.method === 'GET' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (url.includes('/api/config/import') && init?.method === 'POST' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({
          valid: true,
          changesPreview: [],
          errors: [],
          schemaVersion: '1.0.0',
        }), { status: 200 });
      }

      if (url.includes('/api/config/save-all') && init?.method === 'POST' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({
          successItems: [
            { module: 'ui', field: 'language' },
            { module: 'provider', providerId: 'siliconflow', field: 'llmModel' },
          ],
          failedItems: [
            { module: 'storage', field: 'storagePath', code: 'CONFIG_CONFLICT', requestId: 'req-test' },
          ],
          warnings: [],
          requestId: 'req-test',
        }), { status: 200 });
      }

      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in App.test.tsx: ${init?.method || 'GET'} ${url}`);
    });
  });

  it('renders failed status for failed documents', async () => {
    render(<App />);

    expect(await screen.findByText('失败')).toBeInTheDocument();
  });

  it('uses relative api paths by default in development', async () => {
    render(<App />);

    await screen.findByText('失败');

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/documents')).toBe(true);
  });

  it('renders pipeline progress and control actions for documents', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(screen.queryByText('总进度: 72%')).not.toBeInTheDocument();
    expect(screen.queryByText('已处理: 4 / 10')).not.toBeInTheDocument();
    expect(screen.queryByText('正在等待资源')).not.toBeInTheDocument();
    expect(screen.queryByText('不可恢复原因: source-md5-changed')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续处理' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('renders pipeline status panel in document detail view', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '详情' }));

    expect(screen.queryByText('任务状态')).not.toBeInTheDocument();
    expect(screen.queryByText('总进度: 72%')).not.toBeInTheDocument();
    expect(screen.queryByText('已处理: 4 / 10')).not.toBeInTheDocument();
    expect(screen.queryByText('重试次数: 1')).not.toBeInTheDocument();
    expect(screen.queryByText('失败原因: pipeline failed')).not.toBeInTheDocument();
    expect(screen.queryByText('不可恢复原因: source-md5-changed')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回文档库' })).toBeInTheDocument();
  });

  it('enforces settings security headers over caller-provided values', () => {
    const overridden = getSettingsSecurityHeaders({
      [SETTINGS_SESSION_HEADER]: 'bad-session',
      [SETTINGS_CSRF_HEADER]: 'bad-csrf',
      'content-type': 'application/json',
    });
    const expected = getSettingsSecurityHeaders();

    expect(overridden.get(SETTINGS_SESSION_HEADER)).toBe(expected.get(SETTINGS_SESSION_HEADER));
    expect(overridden.get(SETTINGS_CSRF_HEADER)).toBe(expected.get(SETTINGS_CSRF_HEADER));
    expect(overridden.get('content-type')).toBe('application/json');
  });

  it('opens preview modal from preview button', async () => {
    const user = userEvent.setup();
    render(<App />);

    const previewButton = await screen.findByTitle('预览');
    await user.click(previewButton);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByTestId('pdf-preview-renderer')).toBeInTheDocument();
  });

  it('selecting a file triggers upload request', async () => {
    render(<App />);

    const uploadInput = screen.getByTestId('documents-upload-input') as HTMLInputElement;
    const file = new File(['hello'], 'drop.txt', { type: 'text/plain' });
    fireEvent.change(uploadInput, { target: { files: [file] } });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const hasUploadCall = fetchMock.mock.calls.some(([url]) => String(url).includes('/api/upload'));
      expect(hasUploadCall).toBe(true);
    });
  });

  it('qa attachment input shows uploaded file name', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', {name: '问答'}));
    await screen.findByText('上传附件');

    const qaInput = screen.getByTestId('qa-upload-input') as HTMLInputElement;
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });

    fireEvent.change(qaInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('note.txt')).toBeInTheDocument();
    });
  });

  it('filters conversations by search keyword and tag', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(QA_STORAGE_KEY, JSON.stringify({
      activeConversationId: 'conv-1',
      conversations: [
        {
          id: 'conv-1',
          title: '预算复盘',
          updatedAt: '2026-04-01T10:00:00.000Z',
          pinned: false,
          archived: false,
          tags: ['工作'],
          messages: [
            { id: 'm1', role: 'user', content: 'Q1 预算情况', timestamp: '2026-04-01T10:00:00.000Z' },
          ],
        },
        {
          id: 'conv-2',
          title: '日报同步',
          updatedAt: '2026-04-01T11:00:00.000Z',
          pinned: false,
          archived: false,
          tags: ['学习'],
          messages: [
            { id: 'm2', role: 'user', content: '今天学习了什么', timestamp: '2026-04-01T11:00:00.000Z' },
          ],
        },
      ],
    }));

    render(<App />);
    await user.click(await screen.findByRole('button', {name: '问答'}));

    const searchInput = await screen.findByPlaceholderText('搜索会话或内容');
    await user.type(searchInput, '预算');

    const conversationPanel = searchInput.closest('div')?.parentElement?.parentElement;
    expect(conversationPanel).not.toBeNull();
    const conversationScope = within(conversationPanel as HTMLElement);

    expect(conversationScope.getByText('预算复盘')).toBeInTheDocument();
    expect(conversationScope.queryByText('日报同步')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: '学习' }));

    expect(conversationScope.getByText('日报同步')).toBeInTheDocument();
    expect(conversationScope.queryByText('预算复盘')).not.toBeInTheDocument();
  });

  it('keeps qa input editable after switching to qa tab', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('问答'));
    const textArea = await screen.findByPlaceholderText('请输入问题，按 Enter 发送...');
    await user.type(textArea, 'hello input');

    expect(textArea).toHaveValue('hello input');
  });

  it('shows non-editable centered qa title', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(QA_STORAGE_KEY, JSON.stringify({
      activeConversationId: 'conv-title',
      conversations: [
        {
          id: 'conv-title',
          title: '旧会话标题',
          updatedAt: '2026-04-01T10:00:00.000Z',
          pinned: false,
          archived: false,
          tags: [],
          messages: [],
        },
      ],
    }));

    render(<App />);
    await user.click(await screen.findByText('问答'));

    expect((await screen.findAllByText('旧会话标题')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', {name: '旧会话标题'})).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('编辑会话标题')).not.toBeInTheDocument();
  });

  it('shows three independent settings cards and toolbar actions', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('设置'));

    expect(await screen.findByTestId('settings-card-ui')).toBeInTheDocument();
    expect(screen.getByTestId('settings-card-model')).toBeInTheDocument();
    expect(screen.getByTestId('settings-card-storage')).toBeInTheDocument();
    expect(screen.getByTestId('settings-sections').className).toContain('flex-col');

    expect(screen.getByRole('button', { name: '导入' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开普通提示' })).not.toBeInTheDocument();
  });

  it('applies language and theme instantly after selection', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('设置'));

    await user.selectOptions(await screen.findByLabelText('界面语言'), 'en');
    await user.selectOptions(screen.getByLabelText('主题模式'), 'dark');

    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByText('System Settings')).toBeInTheDocument();
    expect(screen.getByTestId('settings-page-surface').className).toContain('bg-slate-950');
  });

  it('applies language and theme to document list and detail pages', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('设置'));
    await user.selectOptions(await screen.findByLabelText('界面语言'), 'en');
    await user.selectOptions(screen.getByLabelText('主题模式'), 'dark');

    expect(await screen.findByText('Knowledge Base')).toBeInTheDocument();
    await user.click(screen.getByText('Docs'));
    expect(await screen.findByText(/Upload Document/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByText('Back to Docs')).toBeInTheDocument();
  });

  it('applies language and theme to qa page and preview modal', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('设置'));
    await user.selectOptions(await screen.findByLabelText('界面语言'), 'en');
    await user.selectOptions(screen.getByLabelText('主题模式'), 'dark');

    await user.click(screen.getByRole('button', { name: 'Q&A' }));
    expect(await screen.findByText('Conversations')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search sessions or messages')).toBeInTheDocument();
    expect(screen.getByText('Upload attachment')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type your question, press Enter to send...')).toBeInTheDocument();
    expect(screen.getByTestId('qa-page-surface').className).toContain('bg-slate-950');

    await user.click(screen.getByRole('button', { name: 'Docs' }));
    const previewButton = await screen.findByRole('button', { name: 'Preview' });
    await user.click(previewButton);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close preview' })).toBeInTheDocument();
    expect(screen.getByText('Click or drag files here')).toBeInTheDocument();
    expect(screen.getByTestId('document-dropzone').className).toContain('bg-slate-900/60');
  });

  it('keeps settings scroll position stable after action clicks', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('设置'));
    const scrollContainer = screen.getByTestId('settings-page-surface').parentElement as HTMLDivElement;
    scrollContainer.scrollTop = 180;

    await user.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(180);
    });
  });

  it('restores qa scroll position when switching away and back', async () => {
    const user = userEvent.setup();
    localStorage.setItem(QA_STORAGE_KEY, JSON.stringify({
      activeConversationId: 'conv-scroll',
      conversations: [
        {
          id: 'conv-scroll',
          title: '滚动测试',
          updatedAt: '2026-04-03T10:00:00.000Z',
          pinned: false,
          archived: false,
          tags: [],
          messages: Array.from({length: 12}).map((_, index) => ({
            id: `m-${index}`,
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `消息 ${index + 1}`,
            timestamp: `2026-04-03T10:${String(index).padStart(2, '0')}:00.000Z`,
          })),
        },
      ],
    }));

    render(<App />);

    await user.click(await screen.findByText('问答'));
    const qaScroll = document.querySelector('[data-testid="qa-page-surface"] .overflow-y-auto.p-6.space-y-6') as HTMLDivElement;
    expect(qaScroll).toBeTruthy();
    qaScroll.scrollTop = 220;
    fireEvent.scroll(qaScroll);

    await user.click(screen.getByRole('button', { name: /文档|Docs/ }));
    await user.click(screen.getByRole('button', { name: /问答|Q&A/ }));

    await waitFor(() => {
      expect(qaScroll.scrollTop).toBe(220);
    });
  });

  it('auto-saves ui preferences immediately and keeps save-all clean', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    render(<App />);

    await user.click(await screen.findByText('设置'));

    await user.selectOptions(await screen.findByLabelText('界面语言'), 'en');

    await waitFor(() => {
      const uiCalls = fetchMock.mock.calls.filter(([url, init]) =>
        String(url).includes('/api/config/ui') && (init as RequestInit)?.method === 'PATCH'
      );
      expect(uiCalls.length).toBeGreaterThanOrEqual(1);
      const firstBody = JSON.parse(String((uiCalls[0][1] as RequestInit)?.body ?? '{}'));
      expect(firstBody).toEqual({ language: 'en' });
      expect(hasRequiredSettingsHeaders(uiCalls[0][1] as RequestInit)).toBe(true);
    });

    expect(screen.getByTestId('settings-card-ui-state')).toHaveTextContent('保存成功');
    expect(screen.queryByTestId('save-all-bar')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('主题模式'), 'dark');

    await waitFor(() => {
      const uiCalls = fetchMock.mock.calls.filter(([url, init]) =>
        String(url).includes('/api/config/ui') && (init as RequestInit)?.method === 'PATCH'
      );
      expect(uiCalls.length).toBeGreaterThanOrEqual(2);
      const latestBody = JSON.parse(String((uiCalls[uiCalls.length - 1][1] as RequestInit)?.body ?? '{}'));
      expect(latestBody).toEqual({ theme: 'dark' });
    });

    expect(screen.queryByTestId('save-all-bar')).not.toBeInTheDocument();
  });

  it('rolls back ui preference when immediate save fails', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (url.includes('/api/config/ui') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: false }), { status: 500 });
      }
      if (url.includes('/api/config/provider/') && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('/api/config/all') && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ storage: { cacheSizeBytes: 0, freeSpaceBytes: 0 } }), { status: 200 });
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in ui-rollback test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    const languageSelect = await screen.findByLabelText('界面语言');
    expect(languageSelect).toHaveValue('zh');

    await user.selectOptions(languageSelect, 'en');

    await waitFor(() => {
      expect(screen.getByLabelText('界面语言')).toHaveValue('zh');
    });
    expect(screen.getByTestId('settings-card-ui-state')).toHaveTextContent('保存失败');
    expect(screen.queryByTestId('save-all-bar')).not.toBeInTheDocument();
    expect((await screen.findAllByText(/界面设置保存失败/)).length).toBeGreaterThan(0);
  });

  it('keeps latest local ui value on rapid double-change of same field', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const firstUiSave = createDeferred<Response>();
    const secondUiSave = createDeferred<Response>();
    const uiSaves = [firstUiSave, secondUiSave];
    const uiBodies: Array<Record<string, unknown>> = [];

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({
          models: [
            { modelId: 'remote-llm-1', modelType: 'llm', displayName: 'Remote LLM 1', description: 'remote', isOnline: true },
            { modelId: 'remote-embed-1', modelType: 'embedding', displayName: 'Remote Embed 1', description: 'remote', isOnline: true },
          ],
        }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({ storage: { cacheSizeBytes: 0, freeSpaceBytes: 0 } }), { status: 200 });
      }
      if (url.includes('/api/config/ui') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        const body = JSON.parse(String(init.body ?? '{}'));
        uiBodies.push(body);
        const deferred = uiSaves.shift();
        if (!deferred) {
          throw new Error('Unexpected extra ui save request');
        }
        return deferred.promise;
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in rapid-ui test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    const languageSelect = await screen.findByLabelText('界面语言');
    await user.selectOptions(languageSelect, 'en');

    await waitFor(() => {
      expect(uiBodies).toEqual([{ language: 'en' }]);
      expect(screen.getByLabelText('界面语言')).toHaveValue('en');
      expect(document.documentElement.lang).toBe('en');
    });

    fireEvent.change(await screen.findByLabelText('界面语言'), { target: { value: 'zh' } });
    await waitFor(() => {
      expect(screen.getByLabelText('界面语言')).toHaveValue('zh');
      expect(document.documentElement.lang).toBe('zh');
    });

    firstUiSave.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));

    await waitFor(() => {
      expect(uiBodies).toEqual([{ language: 'en' }]);
      expect(document.documentElement.lang).toBe('zh');
      expect(screen.getByTestId('settings-card-ui-state')).toHaveTextContent('未修改');
      expect(screen.queryByTestId('save-all-bar')).not.toBeInTheDocument();
    });

    secondUiSave.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
  });

  it('preserves storage dirty edits made during save-all in flight', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const firstProviderSave = createDeferred<Response>();
    const providerSaves = [firstProviderSave];
    const firstStorageSave = createDeferred<Response>();
    const storageSaves = [firstStorageSave];
    const providerBodies: Array<Record<string, unknown>> = [];
    const storageBodies: Array<Record<string, unknown>> = [];

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({ storage: { cacheSizeBytes: 0, freeSpaceBytes: 0 } }), { status: 200 });
      }
      if (url.includes('/api/config/provider/') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        providerBodies.push(JSON.parse(String(init.body ?? '{}')));
        const deferred = providerSaves.shift();
        if (!deferred) {
          throw new Error('Unexpected extra provider save request');
        }
        return deferred.promise;
      }
      if (url.includes('/api/config/storage') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        storageBodies.push(JSON.parse(String(init.body ?? '{}')));
        const deferred = storageSaves.shift();
        if (!deferred) {
          throw new Error('Unexpected extra storage save request');
        }
        return deferred.promise;
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in save-all-race test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    const llmInput = await screen.findByLabelText('LLM 模型');
    fireEvent.change(llmInput, { target: { value: 'Qwen/Qwen2.5-7B-Instruct' } });
    await waitFor(() => {
      expect(llmInput).toHaveValue('Qwen/Qwen2.5-7B-Instruct');
    });
    const storageInput = screen.getByLabelText('存储路径');
    await user.clear(storageInput);
    await user.type(storageInput, './data/path-v1');

    expect(screen.getByTestId('save-all-bar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存全部' }));

    await waitFor(() => {
      expect(providerBodies.length).toBe(1);
      expect(providerBodies[0]).toMatchObject({ llmModel: 'Qwen/Qwen2.5-7B-Instruct' });
    });

    fireEvent.change(storageInput, { target: { value: './data/path-v2' } });

    firstProviderSave.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    firstStorageSave.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));

    await waitFor(() => {
      expect(screen.getByTestId('settings-card-storage-state')).toHaveTextContent('已编辑');
      expect(screen.getByTestId('save-all-bar')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(providerBodies.length).toBe(1);
      expect(providerBodies[0]).toMatchObject({ llmModel: 'Qwen/Qwen2.5-7B-Instruct' });
      expect(storageBodies.length).toBe(1);
      expect(storageBodies[0]).toMatchObject({ storagePath: './data/path-v1' });
    });
  });

  it('keeps unsaved-state contract until latest ui save settles', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const firstUiSave = createDeferred<Response>();
    const uiSaves = [firstUiSave];

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({ storage: { cacheSizeBytes: 0, freeSpaceBytes: 0 } }), { status: 200 });
      }
      if (url.includes('/api/config/ui') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        const deferred = uiSaves.shift();
        if (!deferred) {
          throw new Error('Unexpected extra ui save in unsaved-state test');
        }
        return deferred.promise;
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in unsaved-state test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    const languageSelect = await screen.findByLabelText('界面语言');
    await user.selectOptions(languageSelect, 'en');

    await waitFor(() => {
      expect(screen.getByLabelText('界面语言')).toHaveValue('en');
    });

    const pendingEvent = new Event('beforeunload', { cancelable: true }) as unknown as BeforeUnloadEvent;
    let pendingReturnValue = 'not-set';
    Object.defineProperty(pendingEvent, 'returnValue', {
      configurable: true,
      get() {
        return pendingReturnValue;
      },
      set(value: string) {
        pendingReturnValue = String(value);
      },
    });
    window.dispatchEvent(pendingEvent);
    expect(pendingEvent.defaultPrevented).toBe(true);
    expect(pendingReturnValue).toBe('');

    firstUiSave.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));

    await waitFor(() => {
      expect(screen.getByTestId('settings-card-ui-state')).not.toHaveTextContent('保存中');
    });

    await waitFor(() => {
      const settledEvent = new Event('beforeunload', { cancelable: true }) as unknown as BeforeUnloadEvent;
      let settledReturnValue = 'not-set';
      Object.defineProperty(settledEvent, 'returnValue', {
        configurable: true,
        get() {
          return settledReturnValue;
        },
        set(value: string) {
          settledReturnValue = String(value);
        },
      });
      window.dispatchEvent(settledEvent);
      expect(settledEvent.defaultPrevented).toBe(false);
      expect(settledReturnValue).toBe('not-set');
    });
  });

  it('asks save-or-discard confirmation when switching provider', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    render(<App />);

    await user.click(await screen.findByText('设置'));

    const llmInput = await screen.findByLabelText('LLM 模型');
    await user.selectOptions(llmInput, 'remote-llm-1');

    await user.selectOptions(screen.getByLabelText('服务提供商'), 'openai');

    expect(await screen.findByRole('dialog', { name: '未保存更改' })).toBeInTheDocument();
    expect(screen.getByText('你有未保存的提供商配置。可先保存并切换，或放弃后切换。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '保存并切换' }));

    await waitFor(() => {
      const saveProviderCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/config/provider/') && (init as RequestInit)?.method === 'PATCH'
      );
      expect(saveProviderCall).toBeTruthy();
      expect(hasRequiredSettingsHeaders(saveProviderCall?.[1] as RequestInit)).toBe(true);
      expect(String(saveProviderCall?.[0])).toContain('/api/config/provider/siliconflow');

      const providerBody = JSON.parse(String((saveProviderCall?.[1] as RequestInit)?.body ?? '{}'));
      expect(typeof providerBody.llmModel).toBe('string');
      expect(Object.keys(providerBody)).toContain('llmModel');
      expect(providerBody.expectedVersion).toBe(1);
    });
    expect(screen.getByLabelText('服务提供商')).toHaveValue('openai');
  });

  it('imports by JSON contract and syncs backend all-config mapping', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/settings/auth/bootstrap') && init?.method === 'GET') {
        return new Response(JSON.stringify({
          sessionToken: BOOTSTRAP_SESSION_TOKEN,
          csrfToken: BOOTSTRAP_CSRF_TOKEN,
        }), { status: 200 });
      }
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (url.includes('/api/config/import') && init?.method === 'POST') {
        return new Response(JSON.stringify({ valid: true, changesPreview: [], errors: [], schemaVersion: '1.0.0' }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({
          uiPreferences: { language: 'en-US', theme: 'dark' },
          providers: [
            {
              providerId: 'siliconflow',
              version: 1,
              baseUrl: 'https://api.siliconflow.cn/v1',
              llmModel: 'deepseek-ai/DeepSeek-V3',
              embeddingModel: 'BAAI/bge-m3',
              hasKey: true,
            },
            {
              providerId: 'openai',
              version: 3,
              baseUrl: 'https://api.openai.com/v1',
              llmModel: 'gpt-4.1-mini',
              embeddingModel: 'text-embedding-3-large',
              hasKey: false,
            },
          ],
          storagePreferences: {
            version: 7,
            storagePath: './data/imported-from-backend',
            platform: 'win32',
            cacheSizeBytes: 1024,
            freeSpaceBytes: 2 * 1024 * 1024,
          },
        }), { status: 200 });
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch mock in import-contract test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    const importInput = screen.getByTestId('settings-import-input') as HTMLInputElement;
    fireEvent.change(importInput, {
      target: {
        files: [new File([JSON.stringify({
          schemaVersion: '1.0.0',
          uiPreferences: { language: 'en-US', theme: 'dark' },
          providers: [{ providerId: 'openai', llmModel: 'gpt-4.1-mini' }],
          storagePreferences: { storagePath: './data/imported-from-backend' },
        })], 'settings.json', { type: 'application/json' })],
      },
    });

    await waitFor(() => {
      const importCall = fetchMock.mock.calls.find(([url, reqInit]) =>
        String(url).includes('/api/config/import') && (reqInit as RequestInit)?.method === 'POST'
      );
      expect(importCall).toBeTruthy();
      const importBody = (importCall?.[1] as RequestInit)?.body;
      expect(typeof importBody).toBe('string');
      const body = JSON.parse(String(importBody));
      expect(body).toMatchObject({
        schemaVersion: '1.0.0',
        dryRun: false,
      });
      expect(body.payload).toMatchObject({
        uiPreferences: { language: 'en-US', theme: 'dark' },
      });
    });

    expect(await screen.findByLabelText('界面语言')).toHaveValue('en');
    expect(screen.getByLabelText('主题模式')).toHaveValue('dark');
    expect(screen.getByLabelText('存储路径')).toHaveValue('./data/imported-from-backend');
  });

  it('uses save-all endpoint and consumes failedItems details', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    render(<App />);

    await user.click(await screen.findByText('设置'));
    await user.selectOptions(screen.getByLabelText('LLM 模型'), 'remote-llm-1');
    await user.clear(screen.getByLabelText('存储路径'));
    await user.type(screen.getByLabelText('存储路径'), './data/conflicted');

    await user.click(screen.getByRole('button', { name: '保存全部' }));

    await waitFor(() => {
      const saveAllCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/config/save-all') && (init as RequestInit)?.method === 'POST'
      );
      expect(saveAllCall).toBeTruthy();
      const body = JSON.parse(String((saveAllCall?.[1] as RequestInit)?.body ?? '{}'));
      expect(body.uiPatch ?? null).toBeNull();
      expect(Array.isArray(body.providerPatches)).toBe(true);
      expect(body.providerPatches[0]?.expectedVersion).toBeTypeOf('number');
      expect(body.storagePatch).toBeDefined();
      expect(body.storagePatch?.expectedVersion).toBeTypeOf('number');
      expect(body.expectedVersions).toBeDefined();
    });

    expect(await screen.findByText(/CONFIG_CONFLICT/)).toBeInTheDocument();
  });

  it('shows INVALID_VERSION code when save-all reports stale version payload', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/settings/auth/bootstrap') && init?.method === 'GET') {
        return new Response(JSON.stringify({
          sessionToken: BOOTSTRAP_SESSION_TOKEN,
          csrfToken: BOOTSTRAP_CSRF_TOKEN,
        }), { status: 200 });
      }
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({
          ui: { language: 'zh', theme: 'light' },
          providers: [
            {
              providerId: 'siliconflow',
              version: 1,
              baseUrl: 'https://api.siliconflow.cn/v1',
              llmModel: 'deepseek-ai/DeepSeek-V3',
              embeddingModel: 'BAAI/bge-m3',
            },
          ],
          storage: {
            version: 1,
            storagePath: './data/lance',
            platform: 'win32',
            cacheSizeBytes: 0,
            freeSpaceBytes: 0,
          },
        }), { status: 200 });
      }
      if (url.includes('/api/config/save-all') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          successItems: [],
          failedItems: [
            { module: 'provider', providerId: 'siliconflow', field: 'llmModel', code: 'INVALID_VERSION', requestId: 'req-invalid' },
          ],
          warnings: [],
          requestId: 'req-invalid',
        }), { status: 200 });
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in invalid-version test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));
    await user.selectOptions(screen.getByLabelText('LLM 模型'), 'Qwen/Qwen2.5-7B-Instruct');
    await user.click(screen.getByRole('button', { name: '保存全部' }));

    expect(await screen.findByText(/INVALID_VERSION/)).toBeInTheDocument();
  });

  it('refreshes expected versions after save-all success', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const saveAllBodies: any[] = [];
    let configAllCount = 0;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/settings/auth/bootstrap') && init?.method === 'GET') {
        return new Response(JSON.stringify({
          sessionToken: BOOTSTRAP_SESSION_TOKEN,
          csrfToken: BOOTSTRAP_CSRF_TOKEN,
        }), { status: 200 });
      }
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
          readOnly: true,
          hasApiKey: false,
        }), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        configAllCount += 1;
        const version = configAllCount >= 2 ? 2 : 1;
        return new Response(JSON.stringify({
          ui: { language: 'zh', theme: 'light' },
          providers: [
            {
              providerId: 'siliconflow',
              version,
              baseUrl: 'https://api.siliconflow.cn/v1',
              llmModel: 'deepseek-ai/DeepSeek-V3',
              embeddingModel: 'BAAI/bge-m3',
              hasKey: false,
              maskedKey: '',
            },
          ],
          storage: {
            version,
            storagePath: './data/lance',
            platform: 'win32',
            cacheSizeBytes: 0,
            freeSpaceBytes: 0,
          },
        }), { status: 200 });
      }
      if (url.includes('/api/config/save-all') && init?.method === 'POST') {
        saveAllBodies.push(JSON.parse(String(init.body ?? '{}')));
        return new Response(JSON.stringify({
          successItems: [{ module: 'provider', providerId: 'siliconflow', field: 'llmModel' }],
          failedItems: [],
          warnings: [],
          requestId: 'req-save-all-ok',
        }), { status: 200 });
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in save-all-version-refresh test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    await user.selectOptions(screen.getByLabelText('LLM 模型'), 'Qwen/Qwen2.5-7B-Instruct');
    await user.click(screen.getByRole('button', { name: '保存全部' }));

    await waitFor(() => {
      expect(saveAllBodies).toHaveLength(1);
      expect(saveAllBodies[0].providerPatches[0]?.expectedVersion).toBe(1);
    });

    await user.selectOptions(screen.getByLabelText('LLM 模型'), 'deepseek-ai/DeepSeek-V3');
    await user.click(screen.getByRole('button', { name: '保存全部' }));

    await waitFor(() => {
      expect(saveAllBodies).toHaveLength(2);
      expect(saveAllBodies[1].providerPatches[0]?.expectedVersion).toBe(2);
    });
  });

  it('bootstraps auth tokens before protected settings request', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const bootstrapCalls: RequestInit[] = [];
    const exportCalls: RequestInit[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/settings/auth/bootstrap') && init?.method === 'GET') {
        bootstrapCalls.push(init as RequestInit);
        return new Response(JSON.stringify({
          sessionToken: BOOTSTRAP_SESSION_TOKEN,
          csrfToken: BOOTSTRAP_CSRF_TOKEN,
        }), { status: 200 });
      }
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (url.includes('/api/config/export') && init?.method === 'GET') {
        exportCalls.push(init as RequestInit);
        const headers = new Headers(init?.headers);
        const ok = headers.get(SETTINGS_SESSION_HEADER) === BOOTSTRAP_SESSION_TOKEN
          && headers.get(SETTINGS_CSRF_HEADER) === BOOTSTRAP_CSRF_TOKEN;
        if (!ok) {
          return new Response(JSON.stringify({ code: 'AUTH_UNAUTHORIZED' }), { status: 401 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({ storage: { cacheSizeBytes: 0, freeSpaceBytes: 0 } }), { status: 200 });
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch mock in bootstrap test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));
    await user.click(screen.getByRole('button', { name: '导出' }));

    expect(await screen.findByText('导出成功')).toBeInTheDocument();
    expect(bootstrapCalls.length).toBeGreaterThan(0);
    expect(exportCalls.length).toBeGreaterThan(0);
  });

  it('shows per-card dirty and save-result markers', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (url.includes('/api/config/storage') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: false }), { status: 500 });
      }
      if (url.includes('/api/config/ui') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('/api/config/provider/') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      throw new Error(`Unhandled fetch mock in per-card test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);

    await user.click(await screen.findByText('设置'));
    await user.selectOptions(await screen.findByLabelText('界面语言'), 'en');
    await user.selectOptions(screen.getByLabelText('LLM 模型'), 'Qwen/Qwen2.5-7B-Instruct');
    await user.clear(screen.getByLabelText('存储路径'));
    await user.type(screen.getByLabelText('存储路径'), './data/changed');

    expect(screen.getByTestId('settings-card-ui-state')).toHaveTextContent('保存成功');
    expect(screen.getByTestId('settings-card-model-state')).toHaveTextContent('已编辑');
    expect(screen.getByTestId('settings-card-storage-state')).toHaveTextContent('已编辑');

    await user.click(screen.getByRole('button', { name: '保存全部' }));

    expect(await screen.findByTestId('settings-card-ui-state')).toHaveTextContent('保存成功');
    expect(screen.getByTestId('settings-card-model-state')).toHaveTextContent('保存成功');
    expect(screen.getByTestId('settings-card-storage-state')).toHaveTextContent('保存失败');
  });

  it('wires import/export handlers to backend contracts', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/settings/auth/bootstrap') && init?.method === 'GET') {
        return new Response(JSON.stringify({
          sessionToken: BOOTSTRAP_SESSION_TOKEN,
          csrfToken: BOOTSTRAP_CSRF_TOKEN,
        }), { status: 200 });
      }
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (url.includes('/api/config/export') && init?.method === 'GET') {
        return new Response(JSON.stringify({ schemaVersion: '1.0.0' }), { status: 200 });
      }
      if (url.includes('/api/config/import') && init?.method === 'POST') {
        return new Response(JSON.stringify({ valid: true, changesPreview: [], errors: [], schemaVersion: '1.0.0' }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({
          uiPreferences: { language: 'en-US', theme: 'dark' },
          providers: [
            {
              providerId: 'openai',
              version: 3,
              baseUrl: 'https://api.openai.com/v1',
              llmModel: 'gpt-4.1-mini',
              embeddingModel: 'text-embedding-3-large',
              hasKey: false,
            },
            {
              providerId: 'siliconflow',
              version: 1,
              baseUrl: 'https://api.siliconflow.cn/v1',
              llmModel: 'deepseek-ai/DeepSeek-V3',
              embeddingModel: 'BAAI/bge-m3',
              hasKey: true,
            },
          ],
          storagePreferences: {
            version: 7,
            storagePath: './data/imported',
            platform: 'win32',
            cacheSizeBytes: 2048,
            freeSpaceBytes: 8 * 1024 * 1024,
          },
        }), { status: 200 });
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch mock in import/export contracts test: ${init?.method || 'GET'} ${url}`);
    });
    render(<App />);

    await user.click(await screen.findByText('设置'));

    await user.click(screen.getByRole('button', { name: '导出' }));
    await waitFor(() => {
      const exportCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/config/export') && (init as RequestInit)?.method === 'GET'
      );
      expect(exportCall).toBeTruthy();
      expect(hasRequiredSettingsHeaders(exportCall?.[1] as RequestInit)).toBe(true);
    });

    const importInput = screen.getByTestId('settings-import-input') as HTMLInputElement;
    fireEvent.change(importInput, {
      target: {
        files: [new File([JSON.stringify({
          schemaVersion: '1.0.0',
          uiPreferences: { language: 'en-US', theme: 'dark' },
          providers: [{ providerId: 'openai', llmModel: 'gpt-4.1-mini' }],
          storagePreferences: { storagePath: './data/imported' },
        })], 'settings.json', { type: 'application/json' })],
      },
    });

    await waitFor(() => {
      const importCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/config/import') && (init as RequestInit)?.method === 'POST'
      );
      expect(importCall).toBeTruthy();
      expect(hasRequiredSettingsHeaders(importCall?.[1] as RequestInit)).toBe(true);
      const body = JSON.parse(String((importCall?.[1] as RequestInit)?.body ?? '{}'));
      expect(body).toMatchObject({ schemaVersion: '1.0.0', dryRun: false });
    });

    expect(await screen.findByLabelText('界面语言')).toHaveValue('en');
    expect(screen.getByLabelText('主题模式')).toHaveValue('dark');
    expect(screen.getByLabelText('服务提供商')).toHaveValue('openai');
    expect(screen.getByLabelText('存储路径')).toHaveValue('./data/imported');
    expect(screen.queryByTestId('save-all-bar')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /问答|Q&A/ }));
    expect(await screen.findByText(/(LLM 连接: 正常|LLM: Healthy) \(gpt-4.1-mini\)/)).toBeInTheDocument();
  });

  it('exports settings by triggering a downloadable json file', async () => {
    const user = userEvent.setup();
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:settings-export');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', {
          configurable: true,
          value: anchorClick,
        });
      }
      return element;
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));
    await user.click(screen.getByRole('button', { name: '导出' }));

    await waitFor(() => {
      expect(createObjectUrlSpy).toHaveBeenCalled();
      expect(anchorClick).toHaveBeenCalled();
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(revokeObjectUrlSpy).toHaveBeenCalled();
    });
  });

  it('retries export request once after auth failure', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const exportCalls: RequestInit[] = [];

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (url.includes('/api/config/export') && init?.method === 'GET') {
        exportCalls.push(init as RequestInit);
        if (exportCalls.length === 1) {
          return new Response(JSON.stringify({ code: 'AUTH_UNAUTHORIZED' }), { status: 401 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error(`Unhandled fetch mock in auth-retry test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));
    await user.click(screen.getByRole('button', { name: '导出' }));

    expect(await screen.findByText('导出成功')).toBeInTheDocument();
    await waitFor(() => {
      expect(exportCalls).toHaveLength(2);
    });

    const firstHeaders = new Headers(exportCalls[0]?.headers);
    const secondHeaders = new Headers(exportCalls[1]?.headers);
    expect(firstHeaders.get(SETTINGS_SESSION_HEADER)).toBeTruthy();
    expect(firstHeaders.get(SETTINGS_CSRF_HEADER)).toBeTruthy();
    expect(secondHeaders.get(SETTINGS_SESSION_HEADER)).toBeTruthy();
    expect(secondHeaders.get(SETTINGS_CSRF_HEADER)).toBeTruthy();
  });

  it('shows save-all bar and partial success banner', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (url.includes('/api/config/storage') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: false }), { status: 500 });
      }
      if (url.includes('/api/config/provider/') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: false }), { status: 500 });
      }
      if (url.includes('/api/config/ui') && init?.method === 'PATCH' && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      throw new Error(`Unhandled fetch mock in partial-success test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);

    await user.click(await screen.findByText('设置'));
    await user.selectOptions(await screen.findByLabelText('界面语言'), 'en');
    await user.selectOptions(screen.getByLabelText('LLM 模型'), 'Qwen/Qwen2.5-7B-Instruct');
    await user.clear(screen.getByLabelText('存储路径'));
    await user.type(screen.getByLabelText('存储路径'), './data/changed');

    expect(await screen.findByTestId('save-all-bar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存全部' }));

    expect(await screen.findByText('保存失败，请重试')).toBeInTheDocument();

    await waitFor(() => {
      const uiCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/config/ui'));
      const providerCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/config/provider/') && (init as RequestInit)?.method === 'PATCH'
      );
      const storageCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/config/storage'));

      expect(uiCall).toBeTruthy();
      expect(providerCall).toBeTruthy();
      expect(storageCall).toBeTruthy();
      expect(hasRequiredSettingsHeaders(uiCall?.[1] as RequestInit)).toBe(true);
      expect(hasRequiredSettingsHeaders(providerCall?.[1] as RequestInit)).toBe(true);
      expect(hasRequiredSettingsHeaders(storageCall?.[1] as RequestInit)).toBe(true);

      const uiBody = JSON.parse(String((uiCall?.[1] as RequestInit)?.body ?? '{}'));
      const storageBody = JSON.parse(String((storageCall?.[1] as RequestInit)?.body ?? '{}'));

      expect(uiBody).toEqual({ language: 'en' });
      expect(storageBody).toHaveProperty('storagePath');
      expect(typeof storageBody.storagePath).toBe('string');
    });

    await user.click(screen.getByRole('button', { name: /问答|Q&A/ }));
    expect(await screen.findByText(/(LLM 连接: 正常|LLM: Healthy) \(deepseek-ai\/DeepSeek-V3\)/)).toBeInTheDocument();
  });

  it('confirm dialog traps focus within actionable buttons', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('设置'));
    await user.selectOptions(await screen.findByLabelText('LLM 模型'), 'remote-llm-1');
    await user.selectOptions(screen.getByLabelText('服务提供商'), 'openai');

    const cancelButton = await screen.findByRole('button', { name: '放弃更改并切换' });
    const confirmButton = screen.getByRole('button', { name: '保存并切换' });

    expect(document.activeElement).toBe(cancelButton);
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(confirmButton);
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(cancelButton);
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(confirmButton);
  });

  it('beforeunload uses native prompt contract when unsaved changes exist', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('设置'));
    const llmInput = await screen.findByLabelText('LLM 模型');
    await user.selectOptions(llmInput, 'remote-llm-1');

    const beforeUnloadEvent = new Event('beforeunload', { cancelable: true }) as unknown as BeforeUnloadEvent;
    let nativeReturnValue = 'not-set';
    Object.defineProperty(beforeUnloadEvent, 'returnValue', {
      configurable: true,
      get() {
        return nativeReturnValue;
      },
      set(value: string) {
        nativeReturnValue = String(value);
      },
    });
    window.dispatchEvent(beforeUnloadEvent);

    expect(beforeUnloadEvent.defaultPrevented).toBe(true);
    expect(nativeReturnValue).toBe('');
    expect(screen.queryByRole('dialog', { name: '离开页面确认' })).not.toBeInTheDocument();
  });

  it('shows selected model description from dropdown catalog', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('设置'));
    await user.selectOptions(await screen.findByLabelText('LLM 模型'), 'remote-llm-1');

    expect(await screen.findByText('来自远端模型目录')).toBeInTheDocument();
  });

  it('falls back when directory picker is unavailable', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: undefined,
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    const vectorSection = screen.getByTestId('settings-card-storage-vector');
    await user.click(within(vectorSection).getByRole('button', { name: '选择目录' }));
    expect(await screen.findByText('当前环境不支持目录选择器，请手动输入路径。')).toBeInTheDocument();
  });

  it('loads provider models from backend and renders model dropdown options', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('设置'));

    expect(await screen.findByRole('option', { name: 'Remote LLM 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Remote Embed 1' })).toBeInTheDocument();
    expect(screen.queryByText('模型状态')).not.toBeInTheDocument();
  });

  it('loads protected settings resources with security headers', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    render(<App />);

    await user.click(await screen.findByText('设置'));
    await screen.findByRole('option', { name: 'Remote LLM 1' });

    await waitFor(() => {
      const modelsCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/config/provider/siliconflow/models') && (init as RequestInit | undefined)?.method !== 'PATCH'
      );
      const configAllCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/config/all')
      );
      expect(modelsCall).toBeTruthy();
      expect(configAllCall).toBeTruthy();
      expect(hasRequiredSettingsHeaders(modelsCall?.[1] as RequestInit)).toBe(true);
      expect(hasRequiredSettingsHeaders(configAllCall?.[1] as RequestInit)).toBe(true);
    });
  });

  it('tests provider connectivity with current draft values', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    render(<App />);

    await user.click(await screen.findByText('设置'));
    await user.clear(screen.getByLabelText('Base URL'));
    await user.type(screen.getByLabelText('Base URL'), 'https://api.changed.test/v1');
    await user.clear(screen.getByLabelText('API Key'));
    await user.type(screen.getByLabelText('API Key'), 'sk-changed');
    await user.selectOptions(screen.getByLabelText('LLM 模型'), 'remote-llm-1');
    await user.selectOptions(screen.getByLabelText('Embedding 模型'), 'remote-embed-1');

    await user.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => {
      const testCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/config/provider/siliconflow/test') && (init as RequestInit)?.method === 'POST'
      );
      expect(testCall).toBeTruthy();
      expect(hasRequiredSettingsHeaders(testCall?.[1] as RequestInit)).toBe(true);
      const body = JSON.parse(String((testCall?.[1] as RequestInit)?.body ?? '{}'));
      expect(body).toMatchObject({
        baseUrl: expect.any(String),
        apiKey: expect.any(String),
        llmModel: expect.any(String),
        embeddingModel: expect.any(String),
      });
      expect(body.baseUrl.length).toBeGreaterThan(0);
      expect(body.apiKey.length).toBeGreaterThan(0);
      expect(body.llmModel.length).toBeGreaterThan(0);
      expect(body.embeddingModel.length).toBeGreaterThan(0);
    });

    expect((await screen.findAllByText('连接测试成功')).length).toBeGreaterThan(0);
  });

  it('reveals and copies provider key through secure token flow', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    await user.click(screen.getByRole('button', { name: '显示 Key' }));
    expect(await screen.findByDisplayValue('sk-test-123456')).toBeInTheDocument();

    await waitFor(() => {
      const tokenCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/config/provider/siliconflow/key-token') && (init as RequestInit)?.method === 'POST'
      );
      const revealCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/config/provider/siliconflow/key-reveal') && (init as RequestInit)?.method === 'POST'
      );
      expect(tokenCall).toBeTruthy();
      expect(revealCall).toBeTruthy();
      expect(hasRequiredSettingsHeaders(tokenCall?.[1] as RequestInit)).toBe(true);
      expect(hasRequiredSettingsHeaders(revealCall?.[1] as RequestInit)).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: '复制 Key' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('sk-test-123456');
    });
    expect((await screen.findAllByText('API Key 已复制')).length).toBeGreaterThan(0);
  });

  it('shows masked hint when api key is configured but hidden', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const baseImplementation = fetchMock.getMockImplementation() as
      | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)
      | undefined;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
          documentStoragePath: './data/uploads',
          readOnly: true,
          storagePathLocked: true,
          hasApiKey: true,
        }), {status: 200});
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({
          ui: { language: 'zh', theme: 'light' },
          providers: [
            {
              providerId: 'siliconflow',
              version: 1,
              baseUrl: 'https://api.siliconflow.cn/v1',
              llmModel: 'deepseek-ai/DeepSeek-V3',
              embeddingModel: 'BAAI/bge-m3',
              hasKey: true,
              maskedKey: 'sk-***',
              updatedAt: '2026-04-01T10:00:00.000Z',
              lastModelSyncAt: null,
            },
          ],
          storage: {
            version: 1,
            storagePath: './data/lance',
            documentStoragePath: './data/uploads',
            platform: 'win32',
            cacheSizeBytes: 2048,
            freeSpaceBytes: 8 * 1024 * 1024,
            updatedAt: '2026-04-01T10:00:00.000Z',
          },
        }), { status: 200 });
      }

      if (!baseImplementation) {
        throw new Error(`Missing base fetch mock: ${init?.method || 'GET'} ${url}`);
      }
      return baseImplementation(input, init);
    });

    render(<App />);

    await user.click(await screen.findByText('设置'));

    const apiKeyInput = screen.getByLabelText('API Key') as HTMLInputElement;
    expect(apiKeyInput).toHaveAttribute('type', 'password');
    expect(apiKeyInput).toHaveAttribute('placeholder', '••••••••（已配置）');
  });

  it('bridges storage open/clear actions and displays stats', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    render(<App />);

    await user.click(await screen.findByText('设置'));

    expect(await screen.findByText(/缓存占用: 2.00 KB/)).toBeInTheDocument();

    const vectorSection = screen.getByTestId('settings-card-storage-vector');
    await user.click(within(vectorSection).getByRole('button', { name: '打开目录' }));
    await user.click(within(vectorSection).getByRole('button', { name: '清理缓存' }));

    await waitFor(() => {
      const openCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/storage/open') && (init as RequestInit)?.method === 'POST'
      );
      const clearCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/storage/cache/clear') && (init as RequestInit)?.method === 'POST'
      );
      expect(openCall).toBeTruthy();
      expect(clearCall).toBeTruthy();
      expect(hasRequiredSettingsHeaders(openCall?.[1] as RequestInit)).toBe(true);
      expect(hasRequiredSettingsHeaders(clearCall?.[1] as RequestInit)).toBe(true);
    });

    expect(await screen.findByText(/缓存占用: 0 B/)).toBeInTheDocument();
  });

  it('supports both vector and document knowledge-base directories', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    render(<App />);

    await user.click(await screen.findByText('设置'));

    const vectorSection = screen.getByTestId('settings-card-storage-vector');
    const docSection = screen.getByTestId('settings-card-storage-docs');
    expect(within(vectorSection).getByText('向量知识库目录')).toBeInTheDocument();
    expect(within(docSection).getByText('文档知识库目录')).toBeInTheDocument();

    await user.click(within(docSection).getByRole('button', { name: '打开目录' }));

    await waitFor(() => {
      const openDocsCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/storage/docs/open') && (init as RequestInit)?.method === 'POST'
      );
      expect(openDocsCall).toBeTruthy();
      expect(hasRequiredSettingsHeaders(openDocsCall?.[1] as RequestInit)).toBe(true);
    });
  });

  it('disables storage path editing controls when backend marks config readOnly', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
          documentStoragePath: './data/uploads',
          readOnly: true,
          storagePathLocked: true,
          hasApiKey: true,
        }), {status: 200});
      }
      if (url.includes('/api/settings/auth/bootstrap')) {
        return new Response(JSON.stringify({sessionToken: 'session', csrfToken: 'csrf'}), {status: 200});
      }
      if (url.includes('/api/config/all') && hasRequiredSettingsHeaders(init)) {
        return new Response(JSON.stringify({
          ui: {language: 'zh', theme: 'light'},
          providers: [
            {
              providerId: 'siliconflow',
              version: 1,
              baseUrl: 'https://api.siliconflow.cn/v1',
              llmModel: 'deepseek-ai/DeepSeek-V3',
              embeddingModel: 'BAAI/bge-m3',
              hasKey: true,
              maskedKey: 'sk-***',
              updatedAt: '2026-04-06T00:00:00.000Z',
              lastModelSyncAt: null,
            },
          ],
          storage: {
            version: 1,
            storagePath: './data/lance',
            documentStoragePath: './data/uploads',
            platform: 'linux',
            cacheSizeBytes: 0,
            freeSpaceBytes: 0,
            updatedAt: '2026-04-06T00:00:00.000Z',
          },
        }), {status: 200});
      }
      if (url.includes('/api/config/provider/siliconflow/models')) {
        return new Response(JSON.stringify({models: []}), {status: 200});
      }
      if (url.includes('/api/storage/open') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true, openedInSystem: false, openedPath: './data/lance', stats: {cacheSizeBytes: 0, freeSpaceBytes: 0} }), {status: 200});
      }
      if (url.includes('/api/storage/docs/open') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true, openedInSystem: false, openedPath: './data/uploads', stats: {cacheSizeBytes: 0, freeSpaceBytes: 0} }), {status: 200});
      }
      if (url.includes('/api/storage/cache/clear') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true, reclaimedBytes: 0, stats: {cacheSizeBytes: 0, freeSpaceBytes: 0} }), {status: 200});
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify([]), {status: 200});
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({content: 'ok', sources: []}), {status: 200});
      }

      throw new Error(`Unhandled fetch mock in readOnly storage test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    const vectorSection = await screen.findByTestId('settings-card-storage-vector');
    const docsSection = await screen.findByTestId('settings-card-storage-docs');

    expect(within(vectorSection).getByLabelText('存储路径')).toBeDisabled();
    expect(within(docsSection).getByLabelText('文档目录路径')).toBeDisabled();

    expect(within(vectorSection).getByRole('button', {name: '选择目录'})).toBeDisabled();
    expect(within(docsSection).getByRole('button', {name: '选择目录'})).toBeDisabled();
  });

  it('preserves user edits when delayed model config hydration resolves', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    let resolveModelConfig: (() => void) | null = null;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/config/model')) {
        return await new Promise<Response>((resolve) => {
          resolveModelConfig = () => resolve(new Response(JSON.stringify({
            baseUrl: 'https://late-model.example/v1',
            embeddingModel: 'late-embedding',
            llmModel: 'late-llm',
            storagePath: './late/storage',
          }), { status: 200 }));
        });
      }

      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({ storage: { cacheSizeBytes: 0, freeSpaceBytes: 0 } }), { status: 200 });
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in delayed hydration test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    const llmInput = screen.getByLabelText('LLM 模型');
    fireEvent.change(llmInput, { target: { value: 'Qwen/Qwen2.5-7B-Instruct' } });
    expect(screen.getByLabelText('LLM 模型')).toHaveValue('Qwen/Qwen2.5-7B-Instruct');

    resolveModelConfig?.();

    await waitFor(() => {
      expect(screen.getByLabelText('LLM 模型')).toHaveValue('Qwen/Qwen2.5-7B-Instruct');
    });
  });

  it('cleans pending stream delta on error and keeps fallback message stable', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/mcp') && init?.method === 'POST') {
        const payload = [
          JSON.stringify({ method: 'chat.delta', params: { content: 'partial-' } }),
          JSON.stringify({ method: 'chat.error', params: { message: 'boom' } }),
          '',
        ].join('\n');
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(payload));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }

      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({ storage: { cacheSizeBytes: 0, freeSpaceBytes: 0 } }), { status: 200 });
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in stream cleanup test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('问答'));
    const textArea = await screen.findByPlaceholderText('请输入问题，按 Enter 发送...');
    await user.type(textArea, 'stream test{enter}');

    expect(await screen.findByText((value) => value.includes('抱歉，服务出现错误，请检查硅基流动配置与 API Key。'))).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(screen.getByText((value) => value.includes('抱歉，服务出现错误，请检查硅基流动配置与 API Key。'))).toBeInTheDocument();
    expect(screen.queryByText(/partial-/)).not.toBeInTheDocument();
  });

  it('shows action errors for provider and storage failures', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
        }), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({ storage: { cacheSizeBytes: 0, freeSpaceBytes: 0 } }), { status: 200 });
      }
      if (url.includes('/api/config/provider/siliconflow/test') && init?.method === 'POST') {
        return new Response(JSON.stringify({ code: 'INTERNAL_ERROR' }), { status: 500 });
      }
      if (url.includes('/api/config/provider/siliconflow/key-token') && init?.method === 'POST') {
        return new Response(JSON.stringify({ code: 'INTERNAL_ERROR' }), { status: 500 });
      }
      if (url.includes('/api/storage/open') && init?.method === 'POST') {
        return new Response(JSON.stringify({ code: 'INTERNAL_ERROR' }), { status: 500 });
      }
      if (url.includes('/api/storage/cache/clear') && init?.method === 'POST') {
        return new Response(JSON.stringify({ code: 'INTERNAL_ERROR' }), { status: 500 });
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }
      if (url.includes('/api/chat') || url.includes('/api/mcp')) {
        return new Response(JSON.stringify({ content: 'ok', sources: [] }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in action-failure test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('设置'));

    await user.click(screen.getByRole('button', { name: '测试连接' }));
    expect((await screen.findAllByText('连接测试失败')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '显示 Key' }));
    expect((await screen.findAllByText('显示 API Key 失败')).length).toBeGreaterThan(0);

    const vectorSection = screen.getByTestId('settings-card-storage-vector');
    await user.click(within(vectorSection).getByRole('button', { name: '打开目录' }));
    expect((await screen.findAllByText('打开向量目录失败，请检查路径或系统权限。')).length).toBeGreaterThan(0);

    await user.click(within(vectorSection).getByRole('button', { name: '清理缓存' }));
    expect((await screen.findAllByText('清理向量缓存失败，请稍后重试。')).length).toBeGreaterThan(0);
  });

  it('opens document preview when source item clicked in qa', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

    window.localStorage.setItem(QA_STORAGE_KEY, JSON.stringify({
      activeConversationId: 'conv-source',
      conversations: [
        {
          id: 'conv-source',
          title: '溯源定位测试',
          updatedAt: '2026-04-03T10:00:00.000Z',
          pinned: false,
          archived: false,
          tags: [],
          messages: [
            {
              id: 'm-user',
              role: 'user',
              content: '定位测试',
              timestamp: '2026-04-03T10:00:00.000Z',
            },
            {
              id: 'm-assistant',
              role: 'assistant',
              content: '这是回答',
              timestamp: '2026-04-03T10:00:01.000Z',
              sources: [
                {
                  docId: 'doc-1',
                  chunkId: 'chunk-1',
                  chunkIndex: 0,
                  docName: '失败文档.pdf',
                  content: '预览内容',
                },
              ],
            },
          ],
        },
      ],
    }));

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);

    if (url.includes('/api/documents/doc-1/content')) {
      return new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: {'Content-Type': 'application/pdf'},
      });
    }
    if (url.includes('/api/documents/doc-1')) {
      return new Response(JSON.stringify(detailResponse), { status: 200 });
    }
    if (url.includes('/api/settings/preview-flags')) {
      return new Response(JSON.stringify({enableNewPreviewModal: true, enableNewPreviewByType: {pdf: true}}), {status: 200});
    }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsResponse), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
          documentStoragePath: './data/uploads',
          readOnly: true,
          hasApiKey: false,
        }), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({
          ui: { language: 'zh', theme: 'light' },
          providers: [],
          storage: {
            version: 1,
            storagePath: './data/lance',
            documentStoragePath: './data/uploads',
            platform: 'win32',
            cacheSizeBytes: 0,
            freeSpaceBytes: 0,
            updatedAt: '2026-04-01T10:00:00.000Z',
          },
        }), { status: 200 });
      }
      if (url.includes('/api/settings/auth/bootstrap') && init?.method === 'GET') {
        return new Response(JSON.stringify({
          sessionToken: BOOTSTRAP_SESSION_TOKEN,
          csrfToken: BOOTSTRAP_CSRF_TOKEN,
        }), { status: 200 });
      }
      if (url.includes('/api/upload')) {
        return new Response(JSON.stringify({ status: 'uploading' }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in source-jump test: ${init?.method || 'GET'} ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByText('问答'));

    await user.click(await screen.findByRole('button', {name: '展开溯源'}));
    await user.click(await screen.findByRole('button', {name: '失败文档.pdf-第1分块'}));

    expect(screen.queryByText('目录大纲')).not.toBeInTheDocument();
  });

  it('cleans qa source references after document deletion', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

    window.localStorage.setItem(QA_STORAGE_KEY, JSON.stringify({
      activeConversationId: 'conv-roundtrip',
      conversations: [
        {
          id: 'conv-roundtrip',
          title: '闭环测试',
          updatedAt: '2026-04-03T10:00:00.000Z',
          pinned: false,
          archived: false,
          tags: [],
          messages: [
            {
              id: 'm-user',
              role: 'user',
              content: '定位测试',
              timestamp: '2026-04-03T10:00:00.000Z',
            },
            {
              id: 'm-assistant',
              role: 'assistant',
              content: '这是回答',
              timestamp: '2026-04-03T10:00:01.000Z',
              sources: [
                {
                  docId: 'doc-1',
                  chunkId: 'chunk-1',
                  chunkIndex: 0,
                  docName: '失败文档.pdf',
                  content: '预览内容',
                },
              ],
            },
          ],
        },
      ],
    }));

    let documentsPayload = [...documentsResponse];

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.includes('/api/documents/doc-1/content')) {
        return new Response(new Uint8Array([37, 80, 68, 70]), {
          status: 200,
          headers: {'Content-Type': 'application/pdf'},
        });
      }
      if (url.includes('/api/documents/doc-1') && init?.method === 'DELETE') {
        documentsPayload = documentsPayload.filter((doc) => doc.id !== 'doc-1');
        return new Response(JSON.stringify({success: true}), {status: 200});
      }
      if (url.includes('/api/documents/doc-1')) {
        return new Response(JSON.stringify(detailResponse), { status: 200 });
      }
      if (url.includes('/api/settings/preview-flags')) {
        return new Response(JSON.stringify({enableNewPreviewModal: true, enableNewPreviewByType: {pdf: true}}), {status: 200});
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify(documentsPayload), { status: 200 });
      }
      if (url.includes('/api/config/model')) {
        return new Response(JSON.stringify({
          baseUrl: 'https://api.siliconflow.cn/v1',
          embeddingModel: 'BAAI/bge-m3',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          storagePath: './data/lance',
          documentStoragePath: './data/uploads',
          readOnly: true,
          hasApiKey: false,
        }), { status: 200 });
      }
      if (/\/api\/config\/provider\/.+\/models/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.includes('/api/config/all')) {
        return new Response(JSON.stringify({
          ui: { language: 'zh', theme: 'light' },
          providers: [],
          storage: {
            version: 1,
            storagePath: './data/lance',
            documentStoragePath: './data/uploads',
            platform: 'win32',
            cacheSizeBytes: 0,
            freeSpaceBytes: 0,
            updatedAt: '2026-04-01T10:00:00.000Z',
          },
        }), { status: 200 });
      }
      if (url.includes('/api/settings/auth/bootstrap') && init?.method === 'GET') {
        return new Response(JSON.stringify({
          sessionToken: BOOTSTRAP_SESSION_TOKEN,
          csrfToken: BOOTSTRAP_CSRF_TOKEN,
        }), { status: 200 });
      }

      throw new Error(`Unhandled fetch mock in roundtrip test: ${init?.method || 'GET'} ${url}`);
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(<App />);
    await user.click(await screen.findByText('问答'));
    await user.click(await screen.findByRole('button', {name: '展开溯源'}));
    expect(await screen.findByRole('button', {name: '失败文档.pdf-第1分块'})).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: '文档库'}));
    await user.click(await screen.findByRole('button', {name: '删除'}));
    await user.click(screen.getByRole('button', {name: '问答'}));
    expect(screen.queryByRole('button', {name: '失败文档.pdf-第1分块'})).not.toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
