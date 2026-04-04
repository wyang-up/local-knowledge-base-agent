import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {DocumentListPanel} from './DocumentListPanel';

describe('DocumentListPanel', () => {
  let documents: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    uploadTime: string;
    status: 'failed' | 'processing' | 'cancelled' | 'completed';
    chunkCount: number;
    description: string;
    jobStatus?: 'failed' | 'running' | 'cancelled';
  }>;

  beforeEach(() => {
    vi.restoreAllMocks();
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
      if (url === '/api/documents/doc-1/retry') {
        documents = documents.map((doc) => (doc.id === 'doc-1'
          ? {...doc, jobStatus: 'running'}
          : doc));
        return new Response(JSON.stringify({success: true}), {status: 200});
      }
      if (url === '/api/documents/doc-1') {
        return new Response(JSON.stringify({chunks: []}), {status: 200});
      }
      return new Response(JSON.stringify({status: 'ok'}), {status: 200});
    });
  });

  it('renders documents and triggers detail action', async () => {
    const onOpenDetail = vi.fn();

    render(
      <DocumentListPanel
        isDarkTheme={false}
        language="zh"
        apiUrl={(endpoint) => endpoint}
        onOpenDetail={onOpenDetail}
        locale={{
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
          uploadExists: '文件已存在',
          deleteDocConfirm: '确定删除此文档吗？',
        }}
      />,
    );

    expect(await screen.findByText('失败文档.pdf')).toBeInTheDocument();
    expect(document.querySelector('.lucide-circle-x')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: '详情'}));
    await waitFor(() => {
      expect(onOpenDetail).toHaveBeenCalled();
    });
  });

  it('centers middle headers and keeps actions header centered', async () => {
    render(
      <DocumentListPanel
        isDarkTheme={false}
        language="zh"
        apiUrl={(endpoint) => endpoint}
        onOpenDetail={vi.fn()}
        locale={{
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
          uploadExists: '文件已存在',
          deleteDocConfirm: '确定删除此文档吗？',
        }}
      />,
    );

    expect(await screen.findByText('失败文档.pdf')).toBeInTheDocument();
    const nameHeader = screen.getByRole('columnheader', {name: '文件名'});
    const sizeHeader = screen.getByRole('columnheader', {name: '文件大小'});
    const typeHeader = screen.getByRole('columnheader', {name: '类型'});
    const uploadTimeHeader = screen.getByRole('columnheader', {name: '上传时间'});
    const statusHeader = screen.getByRole('columnheader', {name: '状态'});
    const actionsHeader = screen.getByRole('columnheader', {name: '操作'});

    expect(nameHeader.className).not.toContain('text-center');
    expect(sizeHeader.className).toContain('text-center');
    expect(typeHeader.className).toContain('text-center');
    expect(uploadTimeHeader.className).toContain('text-center');
    expect(statusHeader.className).toContain('text-center');
    expect(actionsHeader.className).toContain('text-center');
  });

  it('keeps retry button disabled while processing after retry starts running job', async () => {
    render(
      <DocumentListPanel
        isDarkTheme={false}
        language="zh"
        apiUrl={(endpoint) => endpoint}
        onOpenDetail={vi.fn()}
        locale={{
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
          uploadExists: '文件已存在',
          deleteDocConfirm: '确定删除此文档吗？',
        }}
      />,
    );

    const retryButton = await screen.findByRole('button', {name: '重试'});
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('解析中...')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', {name: '重试'})).toBeDisabled();
  });

  it('shows disabled retry button for completed documents', async () => {
    documents = [
      {
        id: 'doc-1',
        name: '已完成文档.pdf',
        size: 1024,
        type: '.pdf',
        uploadTime: '2026-03-30T00:00:00.000Z',
        status: 'completed',
        chunkCount: 10,
        description: '',
      },
    ];

    render(
      <DocumentListPanel
        isDarkTheme={false}
        language="zh"
        apiUrl={(endpoint) => endpoint}
        onOpenDetail={vi.fn()}
        locale={{
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
          uploadExists: '文件已存在',
          deleteDocConfirm: '确定删除此文档吗？',
        }}
      />,
    );

    expect(await screen.findByText('已完成')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '重试'})).toBeDisabled();
  });

  it('treats cancelled document as failed action state', async () => {
    documents = [
      {
        id: 'doc-1',
        name: '已取消文档.pdf',
        size: 1024,
        type: '.pdf',
        uploadTime: '2026-03-30T00:00:00.000Z',
        status: 'cancelled',
        chunkCount: 0,
        description: '',
        jobStatus: 'cancelled',
      },
    ];

    render(
      <DocumentListPanel
        isDarkTheme={false}
        language="zh"
        apiUrl={(endpoint) => endpoint}
        onOpenDetail={vi.fn()}
        locale={{
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
          uploadExists: '文件已存在',
          deleteDocConfirm: '确定删除此文档吗？',
        }}
      />,
    );

    expect(await screen.findByText('失败')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '重试'})).toBeInTheDocument();
  });
});
