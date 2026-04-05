import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {PreviewModal} from './PreviewModal';

describe('PreviewModal', () => {
  it('calls onClose when clicking mask', () => {
    const onClose = vi.fn();

    render(
      <PreviewModal
        open
        fileName="测试文档.pdf"
        size={1024}
        type=".pdf"
        uploadTime="2026-04-01T08:00:00.000Z"
        chunkCount={8}
        onClose={onClose}
      >
        <div>内容</div>
      </PreviewModal>,
    );

    fireEvent.mouseDown(screen.getByTestId('preview-modal-mask'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when pressing Escape', () => {
    const onClose = vi.fn();

    render(
      <PreviewModal
        open
        fileName="测试文档.pdf"
        size={1024}
        type=".pdf"
        uploadTime="2026-04-01T08:00:00.000Z"
        chunkCount={8}
        onClose={onClose}
      >
        <div>内容</div>
      </PreviewModal>,
    );

    fireEvent.keyDown(window, {key: 'Escape'});
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders header action buttons and triggers handlers', () => {
    const onClose = vi.fn();
    const onViewDetails = vi.fn();
    const onDownload = vi.fn();

    render(
      <PreviewModal
        open
        fileName="测试文档.pdf"
        size={1024}
        type=".pdf"
        uploadTime="2026-04-01T08:00:00.000Z"
        chunkCount={8}
        onClose={onClose}
        onViewDetails={onViewDetails}
        onDownload={onDownload}
      >
        <div>内容</div>
      </PreviewModal>,
    );

    const viewDetailsButton = screen.getByRole('button', {name: '查看详情'});
    const downloadButton = screen.getByRole('button', {name: '下载'});
    const closeButton = screen.getByRole('button', {name: '关闭预览'});

    expect(viewDetailsButton).toBeInTheDocument();
    expect(downloadButton).toBeInTheDocument();
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(viewDetailsButton);
    fireEvent.click(downloadButton);
    fireEvent.click(closeButton);

    expect(onViewDetails).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders footer metadata values', () => {
    render(
      <PreviewModal
        open
        fileName="测试文档.pdf"
        size={1024}
        type=".pdf"
        uploadTime="2026-04-01T08:00:00.000Z"
        chunkCount={8}
        onClose={vi.fn()}
      >
        <div>内容</div>
      </PreviewModal>,
    );

    expect(screen.getByText('大小: 1.00 KB')).toBeInTheDocument();
    expect(screen.getByText('类型: .pdf')).toBeInTheDocument();
    expect(screen.getByText(/上传时间:/)).toBeInTheDocument();
    expect(screen.getByText('分块数: 8')).toBeInTheDocument();
  });
});
