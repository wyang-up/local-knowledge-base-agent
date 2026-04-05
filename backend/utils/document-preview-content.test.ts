// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildPreviewError,
  buildPreviewResponsePlan,
  parseSingleRangeHeader,
} from './document-preview-content.ts';

describe('document-preview-content parseSingleRangeHeader', () => {
  it('returns null when range header is missing', () => {
    expect(parseSingleRangeHeader(undefined, 100)).toBeNull();
    expect(parseSingleRangeHeader(null, 100)).toBeNull();
  });

  it('parses a valid single byte range', () => {
    expect(parseSingleRangeHeader('bytes=0-99', 100)).toEqual({ start: 0, end: 99 });
    expect(parseSingleRangeHeader('bytes=10-20', 100)).toEqual({ start: 10, end: 20 });
  });

  it('returns invalid for malformed range values', () => {
    expect(parseSingleRangeHeader('', 100)).toBe('invalid');
    expect(parseSingleRangeHeader('bytes=10', 100)).toBe('invalid');
    expect(parseSingleRangeHeader('bytes=10-', 100)).toBe('invalid');
    expect(parseSingleRangeHeader('bytes=-10', 100)).toBe('invalid');
    expect(parseSingleRangeHeader('bytes=1-2,3-4', 100)).toBe('invalid');
    expect(parseSingleRangeHeader('items=1-2', 100)).toBe('invalid');
  });

  it('returns invalid for out-of-bounds ranges', () => {
    expect(parseSingleRangeHeader('bytes=50-40', 100)).toBe('invalid');
    expect(parseSingleRangeHeader('bytes=0-100', 100)).toBe('invalid');
    expect(parseSingleRangeHeader('bytes=100-100', 100)).toBe('invalid');
    expect(parseSingleRangeHeader('bytes=0-0', 0)).toBe('invalid');
  });
});

describe('document-preview-content buildPreviewResponsePlan', () => {
  it('builds 200 response for full content without range header', () => {
    const plan = buildPreviewResponsePlan(undefined, 128);
    expect(plan).toEqual({
      status: 200,
      headers: {
        'Content-Length': '128',
      },
    });
  });

  it('builds 206 response for valid range', () => {
    const plan = buildPreviewResponsePlan('bytes=10-19', 100);
    expect(plan).toEqual({
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes 10-19/100',
        'Content-Length': '10',
      },
      range: { start: 10, end: 19 },
    });
  });

  it('builds 416 response for invalid range', () => {
    const plan = buildPreviewResponsePlan('bytes=90-120', 100);
    expect(plan).toEqual({
      status: 416,
      headers: {
        'Content-Range': 'bytes */100',
      },
    });
  });
});

describe('document-preview-content buildPreviewError', () => {
  it('builds machine-readable error payload', () => {
    expect(buildPreviewError('NOT_FOUND', 'Document not found', false)).toEqual({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Document not found',
        retriable: false,
      },
    });
  });

  it('includes details when provided', () => {
    expect(buildPreviewError('LOAD_TIMEOUT', 'Read timeout', true, { timeoutMs: 8000 })).toEqual({
      ok: false,
      error: {
        code: 'LOAD_TIMEOUT',
        message: 'Read timeout',
        retriable: true,
        details: {
          timeoutMs: 8000,
        },
      },
    });
  });
});
