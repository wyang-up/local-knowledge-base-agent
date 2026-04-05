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

const SINGLE_RANGE_PATTERN = /^bytes=(\d+)-(\d+)$/;

export function parseSingleRangeHeader(rangeHeader: string | null | undefined, totalBytes: number): PreviewRangeParseResult {
  if (rangeHeader == null) {
    return null;
  }

  const match = rangeHeader.trim().match(SINGLE_RANGE_PATTERN);
  if (!match) {
    return 'invalid';
  }

  const start = Number(match[1]);
  const end = Number(match[2]);

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return 'invalid';
  }

  if (start < 0 || end < start || end >= totalBytes) {
    return 'invalid';
  }

  return { start, end };
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
