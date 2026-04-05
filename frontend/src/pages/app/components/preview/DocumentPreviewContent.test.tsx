import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {DocumentPreviewContent, resolveDocumentPreviewType} from './DocumentPreviewContent';

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
    render(
      <DocumentPreviewContent
        mimeType="application/pdf"
        fileName="sample.pdf"
        resource={{
          documentId: 'doc-pdf',
          documentType: '.pdf',
          mimeType: 'application/pdf',
          content: {src: 'blob:https://example.com/sample.pdf'},
          totalPages: 5,
        }}
      />, 
    );

    expect(screen.getByTestId('pdf-preview-renderer')).toBeInTheDocument();
  });

  it('routes to table/json/text renderers by resolved type', () => {
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
        resource={{
          documentId: 'doc-json',
          documentType: '.json',
          content: {profile: {name: 'Alice'}},
        }}
      />,
    );
    expect(screen.getByTestId('json-preview-renderer')).toBeInTheDocument();

    rerender(
      <DocumentPreviewContent
        extension=".txt"
        resource={{
          documentId: 'doc-text',
          documentType: '.txt',
          content: 'hello world',
        }}
      />,
    );
    expect(screen.getByTestId('text-preview-renderer')).toBeInTheDocument();
  });
});
