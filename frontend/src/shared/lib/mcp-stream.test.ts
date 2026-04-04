// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { parseMcpJsonLineBuffer } from './mcp-stream';

describe('mcp-stream', () => {
  it('parses line-delimited json-rpc events', () => {
    const raw = [
      '{"jsonrpc":"2.0","method":"chat.delta","params":{"content":"你"}}',
      '{"jsonrpc":"2.0","method":"chat.delta","params":{"content":"好"}}',
      '',
    ].join('\n');

    const parsed = parseMcpJsonLineBuffer(raw);
    expect(parsed.messages).toEqual([
      { jsonrpc: '2.0', method: 'chat.delta', params: { content: '你' } },
      { jsonrpc: '2.0', method: 'chat.delta', params: { content: '好' } },
    ]);
    expect(parsed.rest).toBe('');
  });

  it('keeps incomplete json line as rest', () => {
    const raw = '{"jsonrpc":"2.0","method":"chat.delta","params":{"content":"A"}}\n{"jsonrpc":';
    const parsed = parseMcpJsonLineBuffer(raw);

    expect(parsed.messages).toEqual([
      { jsonrpc: '2.0', method: 'chat.delta', params: { content: 'A' } },
    ]);
    expect(parsed.rest).toBe('{"jsonrpc":');
  });
});
