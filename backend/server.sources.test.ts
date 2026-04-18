// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('cors', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

let mapSources: typeof import('./server.ts').mapSources;
let enrichRetrievedChunksWithMetadata: typeof import('./server.ts').enrichRetrievedChunksWithMetadata;
let buildSourcesForRetrievedChunks: typeof import('./server.ts').buildSourcesForRetrievedChunks;

beforeAll(async () => {
  const serverModule = await import('./server.ts');
  mapSources = serverModule.mapSources;
  enrichRetrievedChunksWithMetadata = serverModule.enrichRetrievedChunksWithMetadata;
  buildSourcesForRetrievedChunks = serverModule.buildSourcesForRetrievedChunks;
}, 30000);

describe('server source metadata helpers', () => {
  it('maps all structured source fields needed by preview navigation', () => {
    const sources = mapSources([
      {
        id: 'chunk-1',
        docId: 'doc-1',
        chunkIndex: 2,
        fileName: 'sample.json',
        content: '命中内容全文',
        pageStart: 3,
        pageEnd: 4,
        originStart: 'p3:start',
        originEnd: 'p4:end',
        textQuote: '命中内容',
        textOffsetStart: 12,
        textOffsetEnd: 20,
        sheetId: 'sheet-1',
        sheetName: 'Sheet 1',
        rowStart: 8,
        rowEnd: 11,
        columnStart: 2,
        columnEnd: 4,
        jsonPath: '$.users[1].profile',
        nodeStartOffset: 41,
        nodeEndOffset: 98,
      },
    ]);

    expect(sources[0]).toMatchObject({
      docId: 'doc-1',
      chunkId: 'chunk-1',
      chunkIndex: 2,
      pageStart: 3,
      pageEnd: 4,
      originStart: 'p3:start',
      originEnd: 'p4:end',
      textQuote: '命中内容',
      textOffsetStart: 12,
      textOffsetEnd: 20,
      sheetId: 'sheet-1',
      sheetName: 'Sheet 1',
      rowStart: 8,
      rowEnd: 11,
      columnStart: 2,
      columnEnd: 4,
      jsonPath: '$.users[1].profile',
      nodeStartOffset: 41,
      nodeEndOffset: 98,
    });
  });

  it('prefers chunk fields and backfills missing structured fields from metadata', () => {
    const merged = enrichRetrievedChunksWithMetadata(
      [{
        id: 'chunk-1',
        textOffsetStart: 9,
        pageStart: 2,
        title: 'Chunk Title',
      }],
      [{
        chunkId: 'chunk-1',
        textOffsetStart: 12,
        textOffsetEnd: 18,
        pageStart: 5,
        pageEnd: 6,
        originStart: 'meta:start',
        originEnd: 'meta:end',
        sheetId: 'sheet-1',
        sheetName: 'Sheet 1',
        rowStart: 7,
        rowEnd: 8,
        columnStart: 1,
        columnEnd: 2,
        jsonPath: '$.users[0]',
        nodeStartOffset: 30,
        nodeEndOffset: 60,
        title: 'Meta Title',
      }],
    );

    expect(merged[0]).toMatchObject({
      textOffsetStart: 9,
      textOffsetEnd: 18,
      pageStart: 2,
      pageEnd: 6,
      originStart: 'meta:start',
      originEnd: 'meta:end',
      sheetId: 'sheet-1',
      sheetName: 'Sheet 1',
      rowStart: 7,
      rowEnd: 8,
      columnStart: 1,
      columnEnd: 2,
      jsonPath: '$.users[0]',
      nodeStartOffset: 30,
      nodeEndOffset: 60,
      title: 'Chunk Title',
    });
  });

  it('builds sources for retrieved chunks using metadata from the production path', async () => {
    const listChunkMetadata = vi.fn(async (documentId: string) => {
      if (documentId !== 'doc-1') {
        return [];
      }

      return [{
        chunkId: 'chunk-1',
        pageStart: 4,
        pageEnd: 5,
        originStart: 'meta:start',
        originEnd: 'meta:end',
        textOffsetStart: 13,
        textOffsetEnd: 21,
        sheetId: 'sheet-1',
        sheetName: 'Sheet 1',
        rowStart: 2,
        rowEnd: 3,
        columnStart: 1,
        columnEnd: 4,
        jsonPath: '$.users[1].profile',
        nodeStartOffset: 41,
        nodeEndOffset: 98,
      }];
    });

    const sources = await buildSourcesForRetrievedChunks(
      [{
        id: 'chunk-1',
        docId: 'doc-1',
        chunkIndex: 2,
        fileName: 'sample.json',
        content: '命中内容全文',
      }],
      { listChunkMetadata },
    );

    expect(listChunkMetadata).toHaveBeenCalledWith('doc-1');
    expect(sources[0]).toMatchObject({
      docId: 'doc-1',
      chunkId: 'chunk-1',
      chunkIndex: 2,
      pageStart: 4,
      pageEnd: 5,
      originStart: 'meta:start',
      originEnd: 'meta:end',
      textOffsetStart: 13,
      textOffsetEnd: 21,
      sheetId: 'sheet-1',
      sheetName: 'Sheet 1',
      rowStart: 2,
      rowEnd: 3,
      columnStart: 1,
      columnEnd: 4,
      jsonPath: '$.users[1].profile',
      nodeStartOffset: 41,
      nodeEndOffset: 98,
    });
  });
});
