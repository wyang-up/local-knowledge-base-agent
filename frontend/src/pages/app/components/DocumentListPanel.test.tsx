import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {within} from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {DocumentListPanel, type DocumentListLocale} from './DocumentListPanel';

type TestDocument = {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadTime: string;
  status: 'failed' | 'processing' | 'cancelled' | 'completed';
  chunkCount: number;
  description: string;
  jobStatus?: 'failed' | 'running' | 'cancelled';
};

const defaultLocale: DocumentListLocale = {
  uploadDoc: '上传文档',
  uploadFeatureHint: '支持秒传/断点续传',
  uploadHint: '点击或将文件拖拽到这里上传',
  uploadSupport: '支持 .xlsx, .csv, .pdf, .docx, .json 等格式',
  colName: '文件名',
  colSize: '文件大小',
  colType: '类型',
  colUploadTime: '上传时间',
  colStatus: '状态',
  colActions: '操作',
  statusProcessing: '解析中...',
  statusCompleted: '已完成',
  statusFailed: '失败',
  previewAction: '预览',
  detailAction: '详情',
  deleteAction: '删除',
  retryAction: '重试',
  noDocuments: '暂无文档',
  previewTitle: '文档预览',
  previewMetaSize: '大小',
  previewMetaType: '类型',
  previewMetaChunks: '分块',
  previewNoChunks: '该文档暂无分块数据',
  previewMoreChunks: '个分块，点击「详情」查看全部',
  openDetails: '查看详情',
  close: '关闭',
  previewLocateChunk: '定位分块',
  previewDownloadAction: '下载',
  previewCloseAriaLabel: '关闭预览',
  previewLoadError: '预览加载失败，请稍后重试。',
  previewLoading: '预览加载中...',
  previewLegacyFallback: '当前类型暂不支持新预览，已回退到旧版预览。',
  uploadExists: '文件已存在',
  deleteDocConfirm: '确定删除此文档吗？',
};

describe('DocumentListPanel preview integration', () => {
  let documents: TestDocument[];

  beforeEach(() => {
    vi.restoreAllMocks();
    documents = [
      {
        id: 'doc-1',
        name: '示例文档.pdf',
        size: 1024,
        type: '.pdf',
        uploadTime: '2026-03-30T00:00:00.000Z',
        status: 'completed',
        chunkCount: 3,
        description: '',
      },
    ];
  });

  function mockFetch(
    flags: {enableNewPreviewModal?: boolean; enableNewPreviewByType?: Record<string, boolean>} = {
      enableNewPreviewModal: true,
      enableNewPreviewByType: {pdf: true},
    },
  ) {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/documents') {
        return new Response(JSON.stringify(documents), {status: 200});
      }
      if (url === '/api/settings/preview-flags') {
        return new Response(JSON.stringify(flags), {status: 200});
      }
      if (url === '/api/documents/doc-1/content') {
        return new Response(JSON.stringify({mimeType: 'application/pdf', content: {src: 'blob:https://example.com/doc-1.pdf'}}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }
      if (url === '/api/documents/doc-1') {
        return new Response(JSON.stringify({chunks: [{id: 'chunk-1', docId: 'doc-1', index: 0, content: 'legacy-chunk'}]}), {status: 200});
      }
      return new Response(JSON.stringify({status: 'ok'}), {status: 200});
    });
  }

  function renderPanel(onOpenDetail = vi.fn()) {
    render(
      <DocumentListPanel
        isDarkTheme={false}
        language="zh"
        apiUrl={(endpoint) => endpoint}
        onOpenDetail={onOpenDetail}
        onDocumentDeleted={vi.fn()}
        locale={defaultLocale}
      />,
    );
    return {onOpenDetail};
  }

  it('opens new preview modal and closes without changing list state', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText('示例文档.pdf')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', {name: '预览'}));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByTestId('pdf-preview-renderer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: '关闭预览'}));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('示例文档.pdf')).toBeInTheDocument();
  });

  it('uses edge-to-edge content area for txt preview', async () => {
    documents = [
      {
        id: 'doc-1',
        name: '示例文档.txt',
        size: 256,
        type: '.txt',
        uploadTime: '2026-03-30T00:00:00.000Z',
        status: 'completed',
        chunkCount: 1,
        description: '',
      },
    ];

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/documents') {
        return new Response(JSON.stringify(documents), {status: 200});
      }
      if (url === '/api/settings/preview-flags') {
        return new Response(JSON.stringify({enableNewPreviewModal: true, enableNewPreviewByType: {text: true}}), {status: 200});
      }
      if (url === '/api/documents/doc-1/content') {
        return new Response(JSON.stringify({mimeType: 'text/plain', content: 'hello world'}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }
      if (url === '/api/documents/doc-1') {
        return new Response(JSON.stringify({chunks: []}), {status: 200});
      }
      return new Response(JSON.stringify({status: 'ok'}), {status: 200});
    });

    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', {name: '预览'}));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const toolbar = await screen.findByTestId('text-preview-toolbar');
    expect(toolbar).toBeInTheDocument();
    const main = toolbar.closest('main');
    expect(main?.className).not.toContain('px-4');
    expect(main?.className).not.toContain('py-3');
  });

  it('uses same modal sizing strategy for json preview as txt preview', async () => {
    documents = [
      {
        id: 'doc-1',
        name: '示例文档.json',
        size: 512,
        type: '.json',
        uploadTime: '2026-03-30T00:00:00.000Z',
        status: 'completed',
        chunkCount: 1,
        description: '',
      },
    ];

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/documents') {
        return new Response(JSON.stringify(documents), {status: 200});
      }
      if (url === '/api/settings/preview-flags') {
        return new Response(JSON.stringify({enableNewPreviewModal: true, enableNewPreviewByType: {json: true}}), {status: 200});
      }
      if (url === '/api/documents/doc-1/content') {
        return new Response(JSON.stringify({mimeType: 'application/json', content: {name: 'Alice'}}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }
      if (url === '/api/documents/doc-1') {
        return new Response(JSON.stringify({chunks: []}), {status: 200});
      }
      return new Response(JSON.stringify({status: 'ok'}), {status: 200});
    });

    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', {name: '预览'}));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('h-[calc(100vh-2rem)]');
    expect(dialog.className).toContain('max-h-[calc(100vh-2rem)]');

    const renderer = await screen.findByTestId('json-preview-renderer');
    const main = renderer.closest('main');
    expect(main?.className).not.toContain('px-4');
    expect(main?.className).not.toContain('py-3');
  });

  it('locate chunk closes modal and opens detail in phase1', async () => {
    mockFetch();
    const user = userEvent.setup();
    const {onOpenDetail} = renderPanel();

    await user.click(await screen.findByRole('button', {name: '预览'}));
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', {name: '定位分块'}));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({id: 'doc-1'}), undefined);
    });
  });

  it('opens preview modal from previewRequest prop', async () => {
    mockFetch();

    render(
      <DocumentListPanel
        isDarkTheme={false}
        language="zh"
        apiUrl={(endpoint) => endpoint}
        onOpenDetail={vi.fn()}
        locale={defaultLocale}
        previewRequest={{
          docId: 'doc-1',
          docName: '示例文档.pdf',
          chunkId: 'chunk-1',
          chunkIndex: 0,
          content: 'legacy-chunk',
        }}
      />,
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByTestId('pdf-preview-renderer')).toBeInTheDocument();
  });

  it('reopens preview when the same chunk is targeted with different origin or column fields', async () => {
    mockFetch();
    const onPreviewRequestHandled = vi.fn();
    const previewRequestDoc = {
      id: 'doc-1',
      name: '示例文档.pdf',
      size: 1024,
      type: '.pdf',
      uploadTime: '2026-03-30T00:00:00.000Z',
      status: 'completed' as const,
      chunkCount: 3,
      description: '',
    };
    const firstRequest = {
      docId: 'doc-1',
      docName: '示例文档.pdf',
      chunkId: 'chunk-1',
      chunkIndex: 0,
      originStart: 'a',
      originEnd: 'b',
      columnStart: 1,
      columnEnd: 2,
      content: '第一处命中',
    };
    const secondRequest = {
      ...firstRequest,
      originStart: 'c',
      originEnd: 'd',
      columnStart: 3,
      columnEnd: 5,
      content: '第二处命中',
    };

    const {rerender} = render(
      <DocumentListPanel
        isDarkTheme={false}
        language="zh"
        apiUrl={(endpoint) => endpoint}
        onOpenDetail={vi.fn()}
        locale={defaultLocale}
        previewRequest={firstRequest}
        previewRequestDoc={previewRequestDoc}
        onPreviewRequestHandled={onPreviewRequestHandled}
      />,
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('第一处命中')).toBeInTheDocument();
    await waitFor(() => {
      expect(onPreviewRequestHandled).toHaveBeenCalledTimes(1);
    });

    rerender(
      <DocumentListPanel
        isDarkTheme={false}
        language="zh"
        apiUrl={(endpoint) => endpoint}
        onOpenDetail={vi.fn()}
        locale={defaultLocale}
        previewRequest={secondRequest}
        previewRequestDoc={previewRequestDoc}
        onPreviewRequestHandled={onPreviewRequestHandled}
      />,
    );

    await waitFor(() => {
      expect(onPreviewRequestHandled).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('第二处命中')).toBeInTheDocument();
  });

  it('shows only one back-to-qa button in source preview modal', async () => {
    mockFetch();

    render(
      <DocumentListPanel
        isDarkTheme={false}
        language="zh"
        apiUrl={(endpoint) => endpoint}
        onOpenDetail={vi.fn()}
        onBackToQa={vi.fn()}
        locale={defaultLocale}
        previewRequest={{
          docId: 'doc-1',
          docName: '示例文档.pdf',
          chunkId: 'chunk-1',
          chunkIndex: 0,
          content: 'legacy-chunk',
        }}
      />,
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('button', {name: '返回AI回答'})).toHaveLength(1);
  });

  it('falls back to legacy preview when global switch is off', async () => {
    mockFetch({enableNewPreviewModal: false, enableNewPreviewByType: {pdf: true}});
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', {name: '预览'}));

    expect(await screen.findByTestId('legacy-preview-modal-surface')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('legacy-chunk')).toBeInTheDocument();
  });

  it('falls back to legacy preview when type switch is off', async () => {
    mockFetch({enableNewPreviewModal: true, enableNewPreviewByType: {pdf: false}});
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', {name: '预览'}));

    expect(await screen.findByTestId('legacy-preview-modal-surface')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls back to legacy preview when preview flags request fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/documents') {
        return new Response(JSON.stringify(documents), {status: 200});
      }
      if (url === '/api/settings/preview-flags') {
        return new Response(JSON.stringify({error: 'boom'}), {status: 500});
      }
      if (url === '/api/documents/doc-1') {
        return new Response(JSON.stringify({chunks: [{id: 'chunk-1', docId: 'doc-1', index: 0, content: 'legacy-on-flags-error'}]}), {status: 200});
      }
      if (url === '/api/documents/doc-1/content') {
        return new Response(JSON.stringify({mimeType: 'application/pdf', content: {src: 'blob:https://example.com/doc-1.pdf'}}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }
      return new Response(JSON.stringify({status: 'ok'}), {status: 200});
    });

    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', {name: '预览'}));

    expect(await screen.findByTestId('legacy-preview-modal-surface')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('legacy-on-flags-error')).toBeInTheDocument();
  });

  it('auto falls back to legacy preview when new preview content request fails', async () => {
    documents = [
      {
        id: 'doc-1',
        name: '文档一.txt',
        size: 1024,
        type: '.txt',
        uploadTime: '2026-03-30T00:00:00.000Z',
        status: 'completed',
        chunkCount: 1,
        description: '',
      },
    ];

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/documents') {
        return new Response(JSON.stringify(documents), {status: 200});
      }
      if (url === '/api/settings/preview-flags') {
        return new Response(JSON.stringify({enableNewPreviewModal: true, enableNewPreviewByType: {text: true}}), {status: 200});
      }
      if (url === '/api/documents/doc-1/content') {
        return new Response(JSON.stringify({error: 'content failed'}), {status: 500});
      }
      if (url === '/api/documents/doc-1') {
        return new Response(JSON.stringify({chunks: [{id: 'chunk-1', docId: 'doc-1', index: 0, content: 'legacy-after-content-error'}]}), {status: 200});
      }
      return new Response(JSON.stringify({status: 'ok'}), {status: 200});
    });

    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', {name: '预览'}));

    expect(await screen.findByTestId('legacy-preview-modal-surface')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('legacy-after-content-error')).toBeInTheDocument();
  });

  it('keeps retry button disabled while processing after retry starts running job', async () => {
    documents = [
      {
        id: 'doc-1',
        name: '失败文档.pdf',
        size: 1024,
        type: '.pdf',
        uploadTime: '2026-03-30T00:00:00.000Z',
        status: 'failed',
        chunkCount: 0,
        description: '',
        jobStatus: 'failed',
      },
    ];

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/documents') {
        return new Response(JSON.stringify(documents), {status: 200});
      }
      if (url === '/api/settings/preview-flags') {
        return new Response(JSON.stringify({enableNewPreviewModal: true, enableNewPreviewByType: {pdf: true}}), {status: 200});
      }
      if (url === '/api/documents/doc-1/retry') {
        documents = documents.map((doc) => (doc.id === 'doc-1' ? {...doc, jobStatus: 'running'} : doc));
        return new Response(JSON.stringify({success: true}), {status: 200});
      }
      return new Response(JSON.stringify({status: 'ok'}), {status: 200});
    });

    renderPanel();

    const retryButton = await screen.findByRole('button', {name: '重试'});
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('解析中...')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', {name: '重试'})).toBeDisabled();
  });

  it('keeps latest legacy preview result when switching documents quickly', async () => {
    documents = [
      {
        id: 'doc-1',
        name: '文档一.pdf',
        size: 1024,
        type: '.pdf',
        uploadTime: '2026-03-30T00:00:00.000Z',
        status: 'completed',
        chunkCount: 1,
        description: '',
      },
      {
        id: 'doc-2',
        name: '文档二.pdf',
        size: 1024,
        type: '.pdf',
        uploadTime: '2026-03-30T00:00:00.000Z',
        status: 'completed',
        chunkCount: 1,
        description: '',
      },
    ];

    let resolveFirst: ((value: Response) => void) | null = null;
    let resolveSecond: ((value: Response) => void) | null = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/documents') {
        return new Response(JSON.stringify(documents), {status: 200});
      }
      if (url === '/api/settings/preview-flags') {
        return new Response(JSON.stringify({enableNewPreviewModal: false, enableNewPreviewByType: {pdf: true}}), {status: 200});
      }
      if (url === '/api/documents/doc-1') {
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }
      if (url === '/api/documents/doc-2') {
        return new Promise<Response>((resolve) => {
          resolveSecond = resolve;
        });
      }
      return new Response(JSON.stringify({status: 'ok'}), {status: 200});
    });

    const user = userEvent.setup();
    renderPanel();

    const firstRow = (await screen.findByText('文档一.pdf')).closest('tr') as HTMLTableRowElement;
    const secondRow = screen.getByText('文档二.pdf').closest('tr') as HTMLTableRowElement;
    await user.click(within(firstRow).getByRole('button', {name: '预览'}));
    await user.click(within(secondRow).getByRole('button', {name: '预览'}));

    resolveSecond?.(new Response(JSON.stringify({chunks: [{id: 'c2', docId: 'doc-2', index: 0, content: '第二个结果'}]}), {status: 200}));

    await waitFor(() => {
      expect(screen.getByTestId('legacy-preview-modal-surface')).toBeInTheDocument();
      expect(screen.getByText('第二个结果')).toBeInTheDocument();
    });

    resolveFirst?.(new Response(JSON.stringify({chunks: [{id: 'c1', docId: 'doc-1', index: 0, content: '第一个旧结果'}]}), {status: 200}));

    await waitFor(() => {
      expect(screen.queryByText('第一个旧结果')).not.toBeInTheDocument();
      expect(screen.getByText('文档预览 - 文档二.pdf')).toBeInTheDocument();
    });
  });
});
