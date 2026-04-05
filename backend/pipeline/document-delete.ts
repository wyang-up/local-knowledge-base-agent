import fs from 'node:fs';

type DeleteDocumentResourcesInput = {
  documentId: string;
  filePath?: string | null;
  chunkTable?: { delete: (predicate: string) => Promise<unknown> } | null;
  clearDocumentData: (documentId: string) => Promise<unknown>;
  deleteDocumentRow: (documentId: string) => Promise<unknown>;
};

export async function deleteDocumentResources(input: DeleteDocumentResourcesInput) {
  if (input.chunkTable) {
    await input.chunkTable.delete(`docId = '${input.documentId}'`);
  }

  await input.clearDocumentData(input.documentId);
  await input.deleteDocumentRow(input.documentId);

  if (input.filePath && fs.existsSync(input.filePath)) {
    fs.unlinkSync(input.filePath);
  }
}
