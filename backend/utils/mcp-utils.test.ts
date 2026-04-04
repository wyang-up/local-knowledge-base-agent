// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildMcpNotification, buildMcpResult, encodeMcpJsonLine } from './mcp-utils.ts';

describe('mcp-utils', () => {
  it('builds JSON-RPC notification payload', () => {
    expect(buildMcpNotification('chat.delta', { content: '你' })).toEqual({
      jsonrpc: '2.0',
      method: 'chat.delta',
      params: { content: '你' },
    });
  });

  it('builds JSON-RPC result payload with id', () => {
    expect(buildMcpResult('req-1', { ok: true })).toEqual({
      jsonrpc: '2.0',
      id: 'req-1',
      result: { ok: true },
    });
  });

  it('encodes payload as line-delimited JSON', () => {
    const line = encodeMcpJsonLine({ jsonrpc: '2.0', method: 'chat.done' });
    expect(line).toBe('{"jsonrpc":"2.0","method":"chat.done"}\n');
  });
});
