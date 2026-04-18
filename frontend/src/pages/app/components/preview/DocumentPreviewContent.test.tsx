import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {DocumentPreviewContent, resolveDocumentPreviewType} from './DocumentPreviewContent';
import {normalizeSourceHighlightTarget} from './source-highlight-target';

describe('resolveDocumentPreviewType', () => {
  it('uses MIME first, then extension, then fallback type', () => {
    expect(resolveDocumentPreviewType({
      mimeType: 'application/pdf',
      extension: '.json',
      fallbackType: 'text',
    })).toMatchObject({
      resolvedType: 'pdf',
      source: 'mime',
      isFallback: false,
    });

    expect(resolveDocumentPreviewType({
      mimeType: 'application/x-unknown',
      extension: '.csv',
      fallbackType: 'json',
    })).toMatchObject({
      resolvedType: 'table',
      source: 'extension',
      isFallback: false,
    });

    expect(resolveDocumentPreviewType({
      mimeType: 'application/x-unknown',
      extension: '.unknown',
      fallbackType: 'json',
    })).toMatchObject({
      resolvedType: 'json',
      source: 'fallback',
      isFallback: false,
    });
  });

  it('returns fallback state when resolved type is disabled', () => {
    expect(resolveDocumentPreviewType({
      mimeType: 'application/json',
      enabledTypes: {json: false},
    })).toEqual({
      resolvedType: null,
      source: 'mime',
      isFallback: true,
      fallbackReason: 'type-disabled',
      disabledType: 'json',
    });
  });

  it('falls back immediately when higher-priority MIME type is disabled', () => {
    expect(resolveDocumentPreviewType({
      mimeType: 'application/json',
      extension: '.txt',
      fallbackType: 'text',
      enabledTypes: {json: false, text: true},
    })).toEqual({
      resolvedType: null,
      source: 'mime',
      isFallback: true,
      fallbackReason: 'type-disabled',
      disabledType: 'json',
    });
  });
});

describe('normalizeSourceHighlightTarget', () => {
  it('keeps structured-only targets without content', () => {
    expect(normalizeSourceHighlightTarget({
      docId: 'doc-1',
      pageStart: 2,
      textQuote: '目标朔源内容片段',
    })).toEqual({
      docId: 'doc-1',
      pageStart: 2,
      textQuote: '目标朔源内容片段',
    });
  });
});

describe('DocumentPreviewContent', () => {
  it('renders fallback placeholder and reports disabled type', () => {
    const onFallback = vi.fn();

    render(
      <DocumentPreviewContent
        mimeType="application/json"
        enabledTypes={{json: false}}
        onFallback={onFallback}
      />,
    );

    const fallback = screen.getByTestId('preview-placeholder-fallback');
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveAttribute('data-fallback-reason', 'type-disabled');
    expect(fallback).toHaveAttribute('data-disabled-type', 'json');
    expect(onFallback).toHaveBeenCalledWith({
      resolvedType: null,
      source: 'mime',
      isFallback: true,
      fallbackReason: 'type-disabled',
      disabledType: 'json',
    });
  });

  it('does not call onFallback repeatedly on rerender with same fallback result', () => {
    const onFallback = vi.fn();

    const {rerender} = render(
      <DocumentPreviewContent
        mimeType="application/json"
        enabledTypes={{json: false}}
        onFallback={onFallback}
      />,
    );

    expect(onFallback).toHaveBeenCalledTimes(1);

    rerender(
      <DocumentPreviewContent
        mimeType="application/json"
        enabledTypes={{json: false}}
        onFallback={onFallback}
      />,
    );

    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('routes to pdf renderer with preview resource', () => {
    const onLocateChunk = vi.fn();
    const onBackToQa = vi.fn();

    render(
      <DocumentPreviewContent
        mimeType="application/pdf"
        fileName="sample.pdf"
        sourceHighlight={{chunkId: 'chunk-9', chunkIndex: 8, content: 'this is source chunk text'}}
        onLocateChunk={onLocateChunk}
        onBackToQa={onBackToQa}
        resource={{
          documentId: 'doc-pdf',
          documentType: '.pdf',
          mimeType: 'application/pdf',
          content: {src: 'blob:https://example.com/sample.pdf'},
        }}
      />, 
    );

    expect(screen.getByTestId('pdf-preview-renderer')).toBeInTheDocument();
    expect(screen.getByText('溯源定位：')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: '跳转详情'}));
    fireEvent.click(screen.getByRole('button', {name: '返回AI回答'}));
    expect(onLocateChunk).toHaveBeenCalledTimes(1);
    expect(onBackToQa).toHaveBeenCalledTimes(1);
  });

  it('passes source highlight through to pdf preview so it can locate source area', () => {
    render(
      <DocumentPreviewContent
        mimeType="application/pdf"
        fileName="sample.pdf"
        sourceHighlight={{chunkId: 'chunk-9', chunkIndex: 8, content: 'this is source chunk text'}}
        resource={{
          documentId: 'doc-pdf',
          documentType: '.pdf',
          mimeType: 'application/pdf',
          content: {src: '/api/documents/doc-pdf/content'},
        }}
      />, 
    );

    expect(screen.getByTestId('pdf-preview-renderer')).toBeInTheDocument();
    expect(screen.getByText('溯源定位：')).toBeInTheDocument();
    expect(screen.getByTitle('PDF 预览内容')).toBeInTheDocument();
  });

  it('routes to table/json/text renderers by resolved type', () => {
    const onLocateChunk = vi.fn();
    const {rerender} = render(
      <DocumentPreviewContent
        extension=".xlsx"
        resource={{
          documentId: 'doc-table',
          documentType: '.xlsx',
          content: {sheets: [{id: 's1', name: 'Sheet1', rows: [['A']]}]},
        }}
      />,
    );

    expect(screen.getByTestId('table-preview-renderer')).toBeInTheDocument();

    rerender(
      <DocumentPreviewContent
        extension=".json"
        sourceHighlight={{content: 'Alice'}}
        onLocateChunk={onLocateChunk}
        resource={{
          documentId: 'doc-json',
          documentType: '.json',
          content: {profile: {name: 'Alice'}},
        }}
      />,
    );
    expect(screen.getByTestId('json-preview-renderer')).toBeInTheDocument();
    expect(screen.getByTestId('preview-highlight-block')).toBeInTheDocument();

    rerender(
      <DocumentPreviewContent
        extension=".txt"
        sourceHighlight={{content: 'world'}}
        onLocateChunk={onLocateChunk}
        resource={{
          documentId: 'doc-text',
          documentType: '.txt',
          content: 'hello world',
        }}
      />,
    );
    expect(screen.getByTestId('text-preview-renderer')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('preview-highlight-block'));
    expect(onLocateChunk).toHaveBeenCalledTimes(1);
  });
});
