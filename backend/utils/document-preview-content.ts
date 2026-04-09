export type PreviewRange = {
  start: number;
  end: number;
};

export type PreviewRangeParseResult = PreviewRange | null | 'invalid';

export type PreviewResponsePlan =
  | {
      status: 200;
      headers: {
        'Content-Length': string;
      };
    }
  | {
      status: 206;
      headers: {
        'Accept-Ranges': 'bytes';
        'Content-Range': string;
        'Content-Length': string;
      };
      range: PreviewRange;
    }
  | {
      status: 416;
      headers: {
        'Content-Range': string;
      };
    };

export type PreviewErrorCode =
  | 'NOT_FOUND'
  | 'UNSUPPORTED_TYPE'
  | 'RANGE_NOT_SATISFIABLE'
  | 'READ_FAILED'
  | 'LOAD_TIMEOUT'
  | 'TOO_LARGE_PARTIAL'
  | 'ABORTED';

export type PreviewErrorPayload = {
  ok: false;
  error: {
    code: PreviewErrorCode;
    message: string;
    retriable: boolean;
    details?: unknown;
  };
};

const SINGLE_RANGE_PATTERN = /^(\d+)-(\d+)$/;
const OPEN_ENDED_RANGE_PATTERN = /^(\d+)-$/;
const SUFFIX_RANGE_PATTERN = /^-(\d+)$/;

export function parseSingleRangeHeader(rangeHeader: string | null | undefined, totalBytes: number): PreviewRangeParseResult {
  if (rangeHeader == null) {
    return null;
  }

  if (!Number.isInteger(totalBytes) || totalBytes <= 0) {
    return 'invalid';
  }

  const normalized = rangeHeader.trim();
  if (!normalized.toLowerCase().startsWith('bytes=')) {
    return 'invalid';
  }

  const rangeValue = normalized.slice(6).trim();
  if (!rangeValue || rangeValue.includes(',')) {
    return 'invalid';
  }

  const exact = rangeValue.match(SINGLE_RANGE_PATTERN);
  if (exact) {
    const start = Number(exact[1]);
    const end = Number(exact[2]);

    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return 'invalid';
    }

    if (start < 0 || end < start || end >= totalBytes) {
      return 'invalid';
    }

    return { start, end };
  }

  const openEnded = rangeValue.match(OPEN_ENDED_RANGE_PATTERN);
  if (openEnded) {
    const start = Number(openEnded[1]);
    if (!Number.isInteger(start) || start < 0 || start >= totalBytes) {
      return 'invalid';
    }
    return { start, end: totalBytes - 1 };
  }

  const suffix = rangeValue.match(SUFFIX_RANGE_PATTERN);
  if (suffix) {
    const suffixLength = Number(suffix[1]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return 'invalid';
    }
    const clampedLength = Math.min(suffixLength, totalBytes);
    return { start: totalBytes - clampedLength, end: totalBytes - 1 };
  }

  return 'invalid';
}

export function buildPreviewResponsePlan(rangeHeader: string | null | undefined, totalBytes: number): PreviewResponsePlan {
  const parsedRange = parseSingleRangeHeader(rangeHeader, totalBytes);
  if (parsedRange === null) {
    return {
      status: 200,
      headers: {
        'Content-Length': String(totalBytes),
      },
    };
  }

  if (parsedRange === 'invalid') {
    return {
      status: 416,
      headers: {
        'Content-Range': `bytes */${totalBytes}`,
      },
    };
  }

  const contentLength = parsedRange.end - parsedRange.start + 1;
  return {
    status: 206,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${parsedRange.start}-${parsedRange.end}/${totalBytes}`,
      'Content-Length': String(contentLength),
    },
    range: parsedRange,
  };
}

export function buildPreviewError(
  code: PreviewErrorCode,
  message: string,
  retriable: boolean,
  details?: unknown,
): PreviewErrorPayload {
  return {
    ok: false,
    error: {
      code,
      message,
      retriable,
      ...(details === undefined ? {} : { details }),
    },
  };
}
