import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {DocumentDetailPanel} from './DocumentDetailPanel';

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
            {id: 'c1', docId: 'doc-1', index: 0, content: '第一块内容'},
            {id: 'c2', docId: 'doc-1', index: 1, content: '第二块内容'},
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
            {id: 'c1', docId: 'doc-1', index: 0, content: '第一块内容'},
            {id: 'c2', docId: 'doc-1', index: 1, content: '第二块内容'},
          ],
        }}
        onSaveDescription={vi.fn()}
        onBack={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('章节 2'));

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
});
