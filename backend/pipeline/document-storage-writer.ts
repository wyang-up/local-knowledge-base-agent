type StoredChunkInput = {
  chunkId: string;
  content: string;
  embedding: number[];
};

type StoreEmbeddedChunksInput = {
  documentId: string;
  chunks: StoredChunkInput[];
  addToVectorStore: (chunks: StoredChunkInput[]) => Promise<void>;
  saveMetadata: (documentId: string, chunks: StoredChunkInput[]) => Promise<void>;
};

type StoreEmbeddedChunksResult = {
  storedCount: number;
};

export async function storeEmbeddedChunks(input: StoreEmbeddedChunksInput): Promise<StoreEmbeddedChunksResult> {
  await input.addToVectorStore(input.chunks);
  await input.saveMetadata(input.documentId, input.chunks);

  return {
    storedCount: input.chunks.length,
  };
}

export type { StoreEmbeddedChunksInput, StoreEmbeddedChunksResult, StoredChunkInput };
