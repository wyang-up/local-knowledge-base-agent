import fs from 'node:fs/promises';
import type { PathLike } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

type SettingsStoreLike = {
  getAllConfig: () => Promise<{
    storage: {
      storagePath: string;
      documentStoragePath?: string;
    };
  }>;
};

type StorageStats = {
  cacheSizeBytes: number;
  freeSpaceBytes: number;
};

type ClearCacheResult = {
  reclaimedBytes: number;
  stats: StorageStats;
};

export async function resolvePersistedStoragePath(
  settingsStore: SettingsStoreLike,
  requestedStoragePath?: string,
  kind: 'vector' | 'document' = 'vector',
) {
  const all = await settingsStore.getAllConfig();
  const persistedStoragePathRaw = kind === 'document'
    ? normalizeStoragePath(all.storage.documentStoragePath ?? all.storage.storagePath)
    : normalizeStoragePath(all.storage.storagePath);
  if (!persistedStoragePathRaw) {
    throw routeError(400, 'INVALID_STORAGE_PATH', 'persisted storagePath is empty');
  }

  if (!path.isAbsolute(persistedStoragePathRaw)) {
    throw routeError(400, 'INVALID_STORAGE_PATH', 'persisted storagePath must be absolute');
  }

  const persistedStat = await safeStat(persistedStoragePathRaw);
  if (!persistedStat) {
    throw routeError(404, 'STORAGE_PATH_NOT_FOUND', 'persisted storagePath does not exist');
  }
  if (!persistedStat.isDirectory()) {
    throw routeError(400, 'INVALID_STORAGE_PATH', 'persisted storagePath must be a directory');
  }

  const persistedStoragePath = await toCanonicalPath(persistedStoragePathRaw);

  if (requestedStoragePath) {
    const requestedStoragePathRaw = normalizeStoragePath(requestedStoragePath);
    if (!requestedStoragePathRaw) {
      throw routeError(400, 'INVALID_STORAGE_PATH', 'storagePath must be a non-empty string');
    }
    if (!path.isAbsolute(requestedStoragePathRaw)) {
      throw routeError(400, 'INVALID_STORAGE_PATH', 'storagePath must be absolute');
    }

    const canonicalRequestedPath = await toCanonicalPath(requestedStoragePathRaw);
    if (canonicalRequestedPath !== persistedStoragePath) {
      throw routeError(409, 'STORAGE_PATH_MISMATCH', 'requested storagePath does not match persisted settings');
    }
  }

  return persistedStoragePath;
}

export async function openDirectoryInSystem(targetPath: string) {
  const command = resolveOpenCommand();
  if (!command) {
    return false;
  }

  try {
    const child = spawn(command.command, [...command.args, targetPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function clearStorageCache(storagePathValue: string): Promise<ClearCacheResult> {
  const cacheDir = path.join(storagePathValue, 'cache');
  const cacheRealPath = await resolveSafeCacheRealPath(cacheDir);
  const beforeBytes = cacheRealPath ? await getDirectorySizeBytes(cacheRealPath) : 0;

  const entries = cacheRealPath ? await safeReadDir(cacheRealPath) : [];
  for (const entry of entries) {
    const target = path.resolve(cacheRealPath as string, entry.name);
    if (!isPathInside(cacheRealPath as string, target)) {
      throw routeError(400, 'STORAGE_CACHE_UNSAFE_TARGET', 'cache deletion target escapes cache directory');
    }

    const targetRealPath = await safeRealPath(target);
    if (targetRealPath && !isPathInside(cacheRealPath as string, targetRealPath)) {
      throw routeError(400, 'STORAGE_CACHE_UNSAFE_TARGET', 'cache deletion target resolves outside cache directory');
    }

    await fs.rm(target, { recursive: true, force: true });
  }

  const afterBytes = cacheRealPath ? await getDirectorySizeBytes(cacheRealPath) : 0;
  const stats = await collectStorageStats(storagePathValue);

  return {
    reclaimedBytes: Math.max(beforeBytes - afterBytes, 0),
    stats,
  };
}

export async function collectStorageStats(storagePathValue: string): Promise<StorageStats> {
  const cacheDir = path.join(storagePathValue, 'cache');
  const cacheSizeBytes = await getDirectorySizeBytes(cacheDir);
  const freeSpaceBytes = await getFreeSpaceBytes(storagePathValue);

  return {
    cacheSizeBytes,
    freeSpaceBytes,
  };
}

export async function persistStorageStats(db: any, stats: StorageStats) {
  await db.run('UPDATE storage_preferences SET cache_size_bytes = ?, free_space_bytes = ? WHERE id = 1', [
    stats.cacheSizeBytes,
    stats.freeSpaceBytes,
  ]);
}

function normalizeStoragePath(raw: unknown) {
  return typeof raw === 'string' ? raw.trim() : '';
}

function routeError(status: number, code: string, message: string) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function safeStat(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

async function safeReadDir(targetPath: string) {
  try {
    return await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function safeLstat(targetPath: string) {
  try {
    return await fs.lstat(targetPath);
  } catch {
    return null;
  }
}

async function safeRealPath(targetPath: string) {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return null;
  }
}

async function resolveSafeCacheRealPath(cacheDir: string) {
  const lstat = await safeLstat(cacheDir);
  if (!lstat) {
    return null;
  }
  if (lstat.isSymbolicLink()) {
    throw routeError(400, 'STORAGE_CACHE_SYMLINK_FORBIDDEN', 'cache directory cannot be a symlink');
  }
  if (!lstat.isDirectory()) {
    throw routeError(400, 'INVALID_STORAGE_PATH', 'cache path must be a directory');
  }

  const cacheRealPath = await fs.realpath(cacheDir);
  return toNormalizedComparablePath(cacheRealPath);
}

function isPathInside(parent: string, candidate: string) {
  const normalizedParent = toNormalizedComparablePath(parent);
  const normalizedCandidate = toNormalizedComparablePath(candidate);
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`);
}

async function toCanonicalPath(rawPath: string) {
  const resolved = await safeRealPath(rawPath);
  return toNormalizedComparablePath(resolved ?? rawPath);
}

function toNormalizedComparablePath(rawPath: string) {
  const normalized = path.normalize(rawPath);
  return normalized.length > 1 ? normalized.replace(/[\\/]+$/, '') : normalized;
}

async function getDirectorySizeBytes(dirPath: string): Promise<number> {
  const stat = await safeStat(dirPath);
  if (!stat || !stat.isDirectory()) {
    return 0;
  }

  let total = 0;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySizeBytes(nextPath);
      continue;
    }
    if (entry.isFile()) {
      const fileStat = await fs.stat(nextPath);
      total += fileStat.size;
    }
  }
  return total;
}

async function getFreeSpaceBytes(targetPath: string): Promise<number> {
  const fsWithStatFs = fs as typeof fs & {
    statfs?: (pathLike: PathLike) => Promise<{ bavail: number; bsize: number }>;
  };

  if (typeof fsWithStatFs.statfs !== 'function') {
    return 0;
  }

  try {
    const result = await fsWithStatFs.statfs(targetPath);
    return Math.max(Number(result.bavail) * Number(result.bsize), 0);
  } catch {
    return 0;
  }
}

function resolveOpenCommand() {
  if (process.platform === 'win32') {
    return { command: 'explorer.exe', args: [] as string[] };
  }
  if (process.platform === 'darwin') {
    return { command: 'open', args: [] as string[] };
  }
  if (process.platform === 'linux') {
    return { command: 'xdg-open', args: [] as string[] };
  }
  return null;
}
