// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { decodePlainTextBuffer, normalizeUploadedFilename } from './server-utils.ts';

describe('server-utils upload encoding', () => {
  it('normalizes mojibake Chinese filename back to UTF-8', () => {
    const mojibakeName = Buffer.from('测试文档.txt', 'utf8').toString('latin1');
    expect(normalizeUploadedFilename(mojibakeName)).toBe('测试文档.txt');
  });

  it('keeps valid UTF-8 filename unchanged', () => {
    expect(normalizeUploadedFilename('季度报告.pdf')).toBe('季度报告.pdf');
  });

  it('decodes gb18030 plain text content without garbling', () => {
    const gb18030Bytes = Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0x0a, 0xca, 0xc0, 0xbd, 0xe7]);
    const decoded = decodePlainTextBuffer(gb18030Bytes);
    expect(decoded.text).toBe('你好\n世界');
    expect(decoded.encoding).toBe('gb18030');
  });

  it('prefers utf8 for regular utf8 text content', () => {
    const utf8Bytes = Buffer.from('你好\n世界', 'utf8');
    const decoded = decodePlainTextBuffer(utf8Bytes);
    expect(decoded.text).toBe('你好\n世界');
    expect(decoded.encoding).toBe('utf8');
  });
});
