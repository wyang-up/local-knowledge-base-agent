// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteDocumentResources } from './document-delete.ts';

describe('document-delete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes vector rows, pipeline records, document row, and source file together', async () => {
    const tmpFile = path.join(os.tmpdir(), `doc-delete-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'hello');

    const chunkTable = { delete: vi.fn().mockResolvedValue(undefined) };
    const clearDocumentData = vi.fn().mockResolvedValue(undefined);
    const deleteDocumentRow = vi.fn().mockResolvedValue(undefined);

    await deleteDocumentResources({
      documentId: 'doc-1',
      filePath: tmpFile,
      chunkTable,
      clearDocumentData,
      deleteDocumentRow,
    });

    expect(chunkTable.delete).toHaveBeenCalledWith("docId = 'doc-1'");
    expect(clearDocumentData).toHaveBeenCalledWith('doc-1');
    expect(deleteDocumentRow).toHaveBeenCalledWith('doc-1');
    expect(fs.existsSync(tmpFile)).toBe(false);
  });
});
