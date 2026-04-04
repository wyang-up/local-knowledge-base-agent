import path from 'path';
import { promises as fs } from 'fs';

type ArtifactStage = 'parsing' | 'cleaning' | 'chunking' | 'quality_check' | 'embedding' | 'storing';

type ArtifactFingerprint = {
  md5?: string;
  fileSize?: number;
  updatedAt?: string;
};

const ARTIFACT_STAGE_ORDER: ArtifactStage[] = ['parsing', 'cleaning', 'chunking', 'quality_check', 'embedding', 'storing'];

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function getStageIndex(stage: ArtifactStage) {
  return ARTIFACT_STAGE_ORDER.indexOf(stage);
}

export function createDocumentArtifactStore(baseDir: string) {
  const getDocumentDir = (documentId: string) => path.join(baseDir, documentId);
  const getArtifactPath = (documentId: string, stage: ArtifactStage) => path.join(getDocumentDir(documentId), `${stage}.json`);
  const getMetaPath = (documentId: string, stage: ArtifactStage) => path.join(getDocumentDir(documentId), `${stage}.meta.json`);

  return {
    async saveArtifact(documentId: string, stage: ArtifactStage, payload: unknown, fingerprint?: ArtifactFingerprint) {
      const documentDir = getDocumentDir(documentId);
      await ensureDir(documentDir);
      await fs.writeFile(getArtifactPath(documentId, stage), JSON.stringify(payload, null, 2), 'utf8');
      await fs.writeFile(getMetaPath(documentId, stage), JSON.stringify(fingerprint ?? {}, null, 2), 'utf8');
    },

    async loadArtifact(documentId: string, stage: ArtifactStage) {
      try {
        const raw = await fs.readFile(getArtifactPath(documentId, stage), 'utf8');
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    async readArtifactMeta(documentId: string, stage: ArtifactStage) {
      try {
        const raw = await fs.readFile(getMetaPath(documentId, stage), 'utf8');
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    async invalidateFromStage(documentId: string, stage: ArtifactStage) {
      const documentDir = getDocumentDir(documentId);
      const startIndex = getStageIndex(stage);

      await Promise.all(
        ARTIFACT_STAGE_ORDER
          .filter((candidate) => getStageIndex(candidate) >= startIndex)
          .flatMap((candidate) => [getArtifactPath(documentId, candidate), getMetaPath(documentId, candidate)])
          .map((filePath) => fs.rm(filePath, { force: true })),
      );

      try {
        const entries = await fs.readdir(documentDir);
        if (entries.length === 0) {
          await fs.rmdir(documentDir);
        }
      } catch {
        // ignore cleanup failures for missing dirs
      }
    },
  };
}
