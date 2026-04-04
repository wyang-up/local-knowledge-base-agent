// @vitest-environment node

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { afterEach, describe, expect, it } from 'vitest';
import * as xlsx from 'xlsx';
import { parseDocument } from './document-parser.ts';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'document-parser-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('document-parser', () => {
  it('parses gb18030 txt without mojibake', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'sample.txt');
    await fs.writeFile(filePath, Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0x0a, 0xca, 0xc0, 0xbd, 0xe7]));

    const parsed = await parseDocument({ filePath, fileType: 'txt', fileName: 'sample.txt' });

    expect(parsed.text).toContain('你好');
    expect(parsed.units[0]).toMatchObject({ sourceUnit: 'body' });
  });

  it('keeps short txt raw body for whole-text preservation', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'short.txt');
    await fs.writeFile(filePath, '短文本保留', 'utf8');

    const parsed = await parseDocument({ filePath, fileType: 'txt', fileName: 'short.txt' });

    expect(parsed.units).toHaveLength(1);
    expect(parsed.units[0]?.text).toBe('短文本保留');
  });

  it('keeps sheet boundaries and header rows for xlsx', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'table.xlsx');
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ['姓名', '分数'],
      ['张三', 98],
      ['李四', 88],
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, '成绩表');
    xlsx.writeFile(workbook, filePath);

    const parsed = await parseDocument({ filePath, fileType: 'xlsx', fileName: 'table.xlsx' });

    expect(parsed.units[0]).toMatchObject({ sourceUnit: 'sheet', sourceLabel: '成绩表' });
    expect(parsed.units[0]?.headers).toEqual(['姓名', '分数']);
  });

  it('keeps top-level nodes for json and preserves structure', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'data.json');
    await fs.writeFile(filePath, JSON.stringify({ profile: { name: '张三' }, settings: { theme: 'dark' } }), 'utf8');

    const parsed = await parseDocument({ filePath, fileType: 'json', fileName: 'data.json' });

    expect(parsed.units).toHaveLength(2);
    expect(parsed.units.map((unit) => unit.sourceLabel)).toEqual(['profile', 'settings']);
  });
});
