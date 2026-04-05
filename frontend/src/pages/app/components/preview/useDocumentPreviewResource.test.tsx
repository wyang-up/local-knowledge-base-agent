import {renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {useDocumentPreviewResource} from './useDocumentPreviewResource';

type PendingRequest = {
  url: string;
  signal: AbortSignal | null;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
};

function createApiUrl(endpoint: string) {
  return endpoint;
}

describe('useDocumentPreviewResource', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not request preview when disabled or missing document id', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({content: 'unused'}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }),
    );

    const {result, rerender} = renderHook(
      ({documentId, enabled}) => useDocumentPreviewResource({
        apiUrl: createApiUrl,
        documentId,
        documentType: '.txt',
        enabled,
      }),
      {initialProps: {documentId: 'doc-1', enabled: false}},
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.resource).toBeNull();
      expect(result.current.error).toBeNull();
    });

    rerender({documentId: '', enabled: true});

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.resource).toBeNull();
      expect(result.current.error).toBeNull();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('aborts previous request during fast document switching and avoids stale resource', async () => {
    const pending: PendingRequest[] = [];
    vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
      const signal = (init?.signal as AbortSignal | undefined) ?? null;
      const url = String(input);

      return new Promise<Response>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal?.addEventListener('abort', onAbort, {once: true});
        pending.push({
          url,
          signal,
          resolve: (response) => {
            signal?.removeEventListener('abort', onAbort);
            resolve(response);
          },
          reject: (error) => {
            signal?.removeEventListener('abort', onAbort);
            reject(error);
          },
        });
      });
    });

    const {result, rerender} = renderHook(
      ({documentId}) => useDocumentPreviewResource({
        apiUrl: createApiUrl,
        documentId,
        documentType: '.txt',
        enabled: true,
      }),
      {initialProps: {documentId: 'doc-1'}},
    );

    await waitFor(() => {
      expect(pending).toHaveLength(1);
      expect(result.current.loading).toBe(true);
    });

    const firstRequestSignal = pending[0].signal;
    rerender({documentId: 'doc-2'});

    await waitFor(() => {
      expect(firstRequestSignal?.aborted).toBe(true);
      expect(pending).toHaveLength(2);
    });

    const secondRequest = pending[1];
    secondRequest.resolve(new Response(JSON.stringify({content: 'doc-2-content'}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.resource).toMatchObject({
        documentId: 'doc-2',
        documentType: '.txt',
        content: 'doc-2-content',
      });
    });

    expect(result.current.resource?.documentId).toBe('doc-2');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns cached resource when reopening the same document', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const documentId = url.split('/').at(-2) ?? 'unknown';
      return new Response(JSON.stringify({content: `${documentId}-content`}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    });

    const {result, rerender} = renderHook(
      ({documentId, enabled}) => useDocumentPreviewResource({
        apiUrl: createApiUrl,
        documentId,
        documentType: '.txt',
        enabled,
      }),
      {initialProps: {documentId: 'doc-1', enabled: true}},
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.resource?.documentId).toBe('doc-1');
    });

    rerender({documentId: null, enabled: false});
    rerender({documentId: 'doc-1', enabled: true});

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.resource).toMatchObject({
        documentId: 'doc-1',
        documentType: '.txt',
        content: 'doc-1-content',
      });
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores old response when earlier request returns later than new request', async () => {
    const pending: Array<{url: string; resolve: (response: Response) => void}> = [];
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = String(input);
      return new Promise<Response>((resolve) => {
        pending.push({url, resolve});
      });
    });

    const {result, rerender} = renderHook(
      ({documentId}) => useDocumentPreviewResource({
        apiUrl: createApiUrl,
        documentId,
        documentType: '.txt',
        enabled: true,
      }),
      {initialProps: {documentId: 'doc-1'}},
    );

    await waitFor(() => {
      expect(pending).toHaveLength(1);
    });

    rerender({documentId: 'doc-2'});

    await waitFor(() => {
      expect(pending).toHaveLength(2);
    });

    pending[1].resolve(new Response(JSON.stringify({content: 'doc-2-content'}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    }));

    await waitFor(() => {
      expect(result.current.resource?.documentId).toBe('doc-2');
      expect(result.current.resource?.content).toEqual('doc-2-content');
    });

    pending[0].resolve(new Response(JSON.stringify({content: 'doc-1-stale-content'}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    }));

    await waitFor(() => {
      expect(result.current.resource?.documentId).toBe('doc-2');
      expect(result.current.resource?.content).toEqual('doc-2-content');
    });
  });

  it('evicts least recently used cache entry when exceeding size 3', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const documentId = url.split('/').at(-2) ?? 'unknown';
      return new Response(JSON.stringify({content: `${documentId}-content`}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    });

    const {result, rerender} = renderHook(
      ({documentId}) => useDocumentPreviewResource({
        apiUrl: createApiUrl,
        documentId,
        documentType: '.txt',
        enabled: true,
      }),
      {initialProps: {documentId: 'doc-1'}},
    );

    await waitFor(() => {
      expect(result.current.resource?.documentId).toBe('doc-1');
    });

    rerender({documentId: 'doc-2'});
    await waitFor(() => {
      expect(result.current.resource?.documentId).toBe('doc-2');
    });

    rerender({documentId: 'doc-3'});
    await waitFor(() => {
      expect(result.current.resource?.documentId).toBe('doc-3');
    });

    rerender({documentId: 'doc-4'});
    await waitFor(() => {
      expect(result.current.resource?.documentId).toBe('doc-4');
    });

    rerender({documentId: 'doc-1'});
    await waitFor(() => {
      expect(result.current.resource?.documentId).toBe('doc-1');
      expect(result.current.resource?.content).toEqual('doc-1-content');
    });

    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('maps HTTP errors to preview error codes', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const statusCases = [
      {status: 400, code: 'PREVIEW_BAD_REQUEST'},
      {status: 404, code: 'PREVIEW_NOT_FOUND'},
      {status: 415, code: 'PREVIEW_UNSUPPORTED_TYPE'},
    ] as const;

    for (const testCase of statusCases) {
      fetchSpy.mockResolvedValueOnce(new Response('failed', {status: testCase.status}));

      const {result, unmount} = renderHook(() => useDocumentPreviewResource({
        apiUrl: createApiUrl,
        documentId: `doc-http-${testCase.status}`,
        documentType: '.txt',
        enabled: true,
      }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.resource).toBeNull();
        expect(result.current.error?.code).toBe(testCase.code);
        expect(result.current.error?.status).toBe(testCase.status);
      });

      unmount();
    }
  });

  it('returns network error for generic fetch failures', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    const {result} = renderHook(() => useDocumentPreviewResource({
      apiUrl: createApiUrl,
      documentId: 'doc-network',
      documentType: '.txt',
      enabled: true,
    }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.resource).toBeNull();
      expect(result.current.error).toEqual({
        code: 'PREVIEW_NETWORK_ERROR',
        message: 'Preview request failed',
        status: undefined,
      });
    });
  });

  it('treats unknown code/message shaped errors as generic network errors', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue({code: 'UNKNOWN_CODE', message: 'boom'});

    const {result} = renderHook(() => useDocumentPreviewResource({
      apiUrl: createApiUrl,
      documentId: 'doc-unknown-code',
      documentType: '.txt',
      enabled: true,
    }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.resource).toBeNull();
      expect(result.current.error?.code).toBe('PREVIEW_NETWORK_ERROR');
    });
  });

  it('aborts in-flight request without exposing PREVIEW_ABORTED error state', async () => {
    const pending: PendingRequest[] = [];
    vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
      const signal = (init?.signal as AbortSignal | undefined) ?? null;
      const url = String(input);

      return new Promise<Response>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal?.addEventListener('abort', onAbort, {once: true});
        pending.push({
          url,
          signal,
          resolve: (response) => {
            signal?.removeEventListener('abort', onAbort);
            resolve(response);
          },
          reject: (error) => {
            signal?.removeEventListener('abort', onAbort);
            reject(error);
          },
        });
      });
    });

    const {result, rerender} = renderHook(
      ({documentId, enabled}) => useDocumentPreviewResource({
        apiUrl: createApiUrl,
        documentId,
        documentType: '.txt',
        enabled,
      }),
      {initialProps: {documentId: 'doc-abort', enabled: true}},
    );

    await waitFor(() => {
      expect(pending).toHaveLength(1);
      expect(result.current.loading).toBe(true);
    });

    const inflight = pending[0];
    rerender({documentId: 'doc-abort', enabled: false});

    await waitFor(() => {
      expect(inflight.signal?.aborted).toBe(true);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.resource).toBeNull();
    });
  });

  it('maps pdf byte stream to object URL resource', async () => {
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-pdf-url');
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: {'Content-Type': 'application/pdf'},
      }),
    );

    const {result} = renderHook(() => useDocumentPreviewResource({
      apiUrl: createApiUrl,
      documentId: 'doc-pdf-bytes',
      documentType: '.pdf',
      enabled: true,
    }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.resource).toMatchObject({
        documentId: 'doc-pdf-bytes',
        documentType: '.pdf',
        content: {src: 'blob:mock-pdf-url'},
      });
    });

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
  });
});
