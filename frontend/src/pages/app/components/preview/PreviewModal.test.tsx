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

  it('uses A4-like width preset when configured', () => {
    render(
      <PreviewModal
        open
        fileName="测试文档.pdf"
        size={1024}
        type=".pdf"
        uploadTime="2026-04-01T08:00:00.000Z"
        chunkCount={8}
        onClose={vi.fn()}
        sizePreset="a4"
        viewportPreset="a4"
      >
        <div>内容</div>
      </PreviewModal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-w-[900px]');
    expect(dialog.className).toContain('w-[95vw]');
    expect(dialog.className).toContain('h-[calc(100vh-2rem)]');
    expect(dialog.className).toContain('max-h-[calc(100vh-2rem)]');
  });

  it('removes content padding when configured to none', () => {
    render(
      <PreviewModal
        open
        fileName="测试文档.txt"
        size={256}
        type=".txt"
        uploadTime="2026-04-01T08:00:00.000Z"
        chunkCount={2}
        onClose={vi.fn()}
        contentPadding="none"
      >
        <div data-testid="preview-inner-content">内容</div>
      </PreviewModal>,
    );

    const content = screen.getByTestId('preview-inner-content').parentElement;
    expect(content).toBeTruthy();
    expect(content?.className).not.toContain('px-4');
    expect(content?.className).not.toContain('py-3');
  });
});
