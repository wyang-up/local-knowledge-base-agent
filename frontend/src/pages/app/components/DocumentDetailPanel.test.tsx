import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {DocumentDetailPanel} from './DocumentDetailPanel';

Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

describe('DocumentDetailPanel', () => {
  it('renders detail header and routes back action', () => {
    const onBack = vi.fn();

    render(
      <DocumentDetailPanel
        isDarkTheme={false}
        locale={{
          backToDocs: '返回文档库',
          tabSettings: '设置',
          detailParsed: '已解析',
          previewMetaChunks: '分块',
          detailDescriptionLabel: '文档描述',
          detailDescriptionPlaceholder: '添加文档描述...',
          detailOutlineTitle: '目录大纲',
          detailNoOutline: '暂无目录',
          detailSectionPrefix: '章节',
          detailChunkTitle: '向量分块列表',
          detailChunkHint: '已检索出相似度最高的前 4 个块',
          detailChunkTag: '分块',
          detailExpand: '展开全文',
        }}
        details={{
          id: 'doc-1',
          name: '样例文档.pdf',
          size: 1024,
          type: '.pdf',
          uploadTime: '2026-03-30T00:00:00.000Z',
          status: 'completed',
          chunkCount: 2,
          description: '',
          chunks: [
            {id: 'c1', docId: 'doc-1', index: 0, content: '# 第一章\n第一块内容'},
            {id: 'c2', docId: 'doc-1', index: 1, content: '## 第二章\n第二块内容'},
          ],
        }}
        onSaveDescription={vi.fn()}
        onBack={onBack}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('样例文档.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: '返回文档库'}));
    expect(onBack).toHaveBeenCalled();
  });

  it('highlights matched chunk when clicking outline item', () => {
    render(
      <DocumentDetailPanel
        isDarkTheme={false}
        locale={{
          backToDocs: '返回文档库',
          tabSettings: '设置',
          detailParsed: '已解析',
          previewMetaChunks: '分块',
          detailDescriptionLabel: '文档描述',
          detailDescriptionPlaceholder: '添加文档描述...',
          detailOutlineTitle: '目录大纲',
          detailNoOutline: '暂无目录',
          detailSectionPrefix: '章节',
          detailChunkTitle: '向量分块列表',
          detailChunkHint: '已检索出相似度最高的前 4 个块',
          detailChunkTag: '分块',
          detailExpand: '展开全文',
        }}
        details={{
          id: 'doc-1',
          name: '样例文档.pdf',
          size: 1024,
          type: '.pdf',
          uploadTime: '2026-03-30T00:00:00.000Z',
          status: 'completed',
          chunkCount: 2,
          description: '',
          chunks: [
            {id: 'c1', docId: 'doc-1', index: 0, content: '# 第一章\n第一块内容'},
            {id: 'c2', docId: 'doc-1', index: 1, content: '## 第二章\n第二块内容'},
          ],
        }}
        onSaveDescription={vi.fn()}
        onBack={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('第二章'));

    expect(screen.getByTestId('detail-chunk-c2').className).toContain('ring-2');
  });

  it('saves description when textarea loses focus', () => {
    const onSaveDescription = vi.fn();
    render(
      <DocumentDetailPanel
        isDarkTheme={false}
        locale={{
          backToDocs: '返回文档库',
          tabSettings: '设置',
          detailParsed: '已解析',
          previewMetaChunks: '分块',
          detailDescriptionLabel: '文档描述',
          detailDescriptionPlaceholder: '添加文档描述...',
          detailOutlineTitle: '目录大纲',
          detailNoOutline: '暂无目录',
          detailSectionPrefix: '章节',
          detailChunkTitle: '向量分块列表',
          detailChunkHint: '已检索出相似度最高的前 4 个块',
          detailChunkTag: '分块',
          detailExpand: '展开全文',
        }}
        details={{
          id: 'doc-1',
          name: '样例文档.pdf',
          size: 1024,
          type: '.pdf',
          uploadTime: '2026-03-30T00:00:00.000Z',
          status: 'completed',
          chunkCount: 1,
          description: '旧描述',
          chunks: [
            {id: 'c1', docId: 'doc-1', index: 0, content: '第一块内容'},
          ],
        }}
        onSaveDescription={onSaveDescription}
        onBack={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText('添加文档描述...');
    fireEvent.change(textarea, {target: {value: '新描述'}});
    fireEvent.blur(textarea);

    expect(onSaveDescription).toHaveBeenCalledWith('新描述');
  });

  it('expands full chunk content when clicking expand button', () => {
    render(
      <DocumentDetailPanel
        isDarkTheme={false}
        locale={{
          backToDocs: '返回文档库',
          tabSettings: '设置',
          detailParsed: '已解析',
          previewMetaChunks: '分块',
          detailDescriptionLabel: '文档描述',
          detailDescriptionPlaceholder: '添加文档描述...',
          detailOutlineTitle: '目录大纲',
          detailNoOutline: '暂无目录',
          detailSectionPrefix: '章节',
          detailChunkTitle: '向量分块列表',
          detailChunkHint: '已检索出相似度最高的前 4 个块',
          detailChunkTag: '分块',
          detailExpand: '展开全文',
        }}
        details={{
          id: 'doc-1',
          name: '样例文档.pdf',
          size: 1024,
          type: '.pdf',
          uploadTime: '2026-03-30T00:00:00.000Z',
          status: 'completed',
          chunkCount: 1,
          description: '',
          chunks: [
            {id: 'c1', docId: 'doc-1', index: 0, content: '第一块内容'},
          ],
        }}
        onSaveDescription={vi.fn()}
        onBack={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    const content = screen.getByText('第一块内容');
    expect(content.className).toContain('line-clamp-2');

    fireEvent.click(screen.getByRole('button', {name: '展开全文'}));

    expect(content.className).not.toContain('line-clamp-2');
  });

  it('shows section chunk count and quick action buttons', () => {
    render(
      <DocumentDetailPanel
        isDarkTheme={false}
        locale={{
          backToDocs: '返回文档库',
          tabSettings: '设置',
          detailParsed: '已解析',
          previewMetaChunks: '分块',
          detailDescriptionLabel: '文档描述',
          detailDescriptionPlaceholder: '添加文档描述...',
          detailOutlineTitle: '目录导航',
          detailNoOutline: '暂无目录',
          detailSectionPrefix: '章节',
          detailChunkTitle: '分块内容',
          detailChunkHint: '点击查看详情',
          detailChunkTag: '分块',
          detailExpand: '展开',
        }}
        details={{
          id: 'doc-1',
          name: '样例文档.pdf',
          size: 1024,
          type: '.pdf',
          uploadTime: '2026-03-30T00:00:00.000Z',
          status: 'completed',
          chunkCount: 2,
          description: '',
          chunks: [
            {id: 'c1', docId: 'doc-1', index: 0, content: '# 第一章\n第一块内容'},
            {id: 'c2', docId: 'doc-1', index: 1, content: '第二块内容'},
          ],
        }}
        onSaveDescription={vi.fn()}
        onBack={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('[2块]')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '下载'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '分享'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '打印'})).toBeInTheDocument();
  });

  it('shows copied reminder after copying chunk content', async () => {
    render(
      <DocumentDetailPanel
        isDarkTheme={false}
        locale={{
          backToDocs: '返回文档库',
          tabSettings: '设置',
          detailParsed: '已解析',
          previewMetaChunks: '分块',
          detailDescriptionLabel: '文档描述',
          detailDescriptionPlaceholder: '添加文档描述...',
          detailOutlineTitle: '目录导航',
          detailNoOutline: '暂无目录',
          detailSectionPrefix: '章节',
          detailChunkTitle: '分块内容',
          detailChunkHint: '点击查看详情',
          detailChunkTag: '分块',
          detailExpand: '展开',
          detailCopyAction: '复制',
        }}
        details={{
          id: 'doc-1',
          name: '样例文档.pdf',
          size: 1024,
          type: '.pdf',
          uploadTime: '2026-03-30T00:00:00.000Z',
          status: 'completed',
          chunkCount: 1,
          description: '',
          chunks: [
            {id: 'c1', docId: 'doc-1', index: 0, content: '# 第一章\n第一块内容'},
          ],
        }}
        onSaveDescription={vi.fn()}
        onBack={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: '复制'}));

    expect(await screen.findByText('复制成功')).toBeInTheDocument();
  });
});
