import type express from 'express';

type SqliteDb = any;

type CreateSettingsStoreOptions = {
  storagePath: string;
  documentStoragePath?: string;
  platform?: string;
};

type UiPatch = {
  language?: string;
  theme?: string;
};

type ProviderPatch = {
  baseUrl?: string;
  llmModel?: string;
  embeddingModel?: string;
  apiKey?: string;
};

type StoragePatch = {
  storagePath?: string;
  documentStoragePath?: string;
};

type ProviderModelType = 'llm' | 'embedding';

type ProviderModelCatalogItem = {
  modelId: string;
  modelType: ProviderModelType;
  displayName: string;
  description: string;
  isOnline: boolean;
  lastCheckedAt: string | null;
};

type ImportProviderItem = {
  providerId?: string;
  baseUrl?: string;
  llmModel?: string;
  embeddingModel?: string;
};

type ImportPayload = {
  uiPreferences?: {
    language?: string;
    theme?: string;
  };
  providers?: ImportProviderItem[];
  storagePreferences?: {
    storagePath?: string;
    documentStoragePath?: string;
  };
};

type ImportChangeItem = {
  module: 'ui' | 'provider' | 'storage';
  field: string;
  providerId?: string;
  from: string;
  to: string;
};

type ResetScope = 'module' | 'all';
type ResetTarget = 'ui' | 'provider' | 'storage';

const FIXED_MASK = '******';
const UI_ROW_ID = 1;
const STORAGE_ROW_ID = 1;

const DEFAULT_UI = {
  language: 'zh-CN',
  theme: 'system',
};

const DEFAULT_PROVIDER_CONFIGS = [
  {
    providerId: 'siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    llmModel: 'deepseek-ai/DeepSeek-V3',
    embeddingModel: 'BAAI/bge-m3',
  },
  {
    providerId: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    llmModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
  },
  {
    providerId: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    llmModel: 'gemini-2.0-flash',
    embeddingModel: 'text-embedding-004',
  },
  {
    providerId: 'custom_compatible',
    baseUrl: 'http://localhost:11434/v1',
    llmModel: 'qwen2.5:latest',
    embeddingModel: 'bge-m3:latest',
  },
];

export class ConfigConflictError extends Error {
  status = 409;
  code = 'CONFIG_CONFLICT';

  constructor(message = 'settings version is stale') {
    super(message);
    this.name = 'ConfigConflictError';
  }
}

export class InvalidStoragePathError extends Error {
  status = 400;
  code = 'INVALID_STORAGE_PATH';

  constructor(message = 'storagePath must be a non-empty string') {
    super(message);
    this.name = 'InvalidStoragePathError';
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeStoragePath(raw: string) {
  return raw.trim();
}

function toMaskedKey(apiKey: string) {
  const normalized = apiKey.trim();
  if (!normalized) {
    return '';
  }
  const prefix = normalized.slice(0, 3);
  const suffix = normalized.slice(-2);
  return `${prefix}${FIXED_MASK}${suffix}`;
}

async function ensureSchema(db: SqliteDb, options: CreateSettingsStoreOptions) {
  const defaultDocumentStoragePath = options.documentStoragePath ?? options.storagePath;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ui_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      language TEXT NOT NULL,
      theme TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_configs (
      provider_id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      base_url TEXT NOT NULL,
      llm_model TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      api_key TEXT NOT NULL,
      has_key INTEGER NOT NULL,
      last_model_sync_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS storage_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      document_storage_path TEXT NOT NULL,
      platform TEXT NOT NULL,
      cache_size_bytes INTEGER NOT NULL,
      free_space_bytes INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_model_catalog (
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL,
      is_online INTEGER NOT NULL,
      last_checked_at TEXT,
      PRIMARY KEY (provider_id, model_id)
    );
  `);

  await ensureStorageColumns(db, defaultDocumentStoragePath);

  await db.run(
    `INSERT INTO ui_preferences (id, language, theme, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [UI_ROW_ID, DEFAULT_UI.language, DEFAULT_UI.theme, nowIso()],
  );

  await db.run(
    `INSERT INTO storage_preferences (id, version, storage_path, document_storage_path, platform, cache_size_bytes, free_space_bytes, updated_at)
     VALUES (?, 1, ?, ?, ?, 0, 0, ?)
     ON CONFLICT(id) DO NOTHING`,
    [STORAGE_ROW_ID, options.storagePath, defaultDocumentStoragePath, options.platform ?? process.platform, nowIso()],
  );

  for (const config of DEFAULT_PROVIDER_CONFIGS) {
    await db.run(
      `INSERT INTO provider_configs (provider_id, version, base_url, llm_model, embedding_model, api_key, has_key, last_model_sync_at, updated_at)
       VALUES (?, 1, ?, ?, ?, '', 0, NULL, ?)
       ON CONFLICT(provider_id) DO NOTHING`,
      [config.providerId, config.baseUrl, config.llmModel, config.embeddingModel, nowIso()],
    );
  }
}

async function ensureStorageColumns(db: SqliteDb, defaultDocumentStoragePath: string) {
  const columns = await db.all('PRAGMA table_info(storage_preferences)');
  const hasDocumentStoragePath = columns.some((column: any) => column?.name === 'document_storage_path');
  if (hasDocumentStoragePath) {
    return;
  }

  const escapedDefaultPath = defaultDocumentStoragePath.replace(/'/g, "''");
  try {
    await db.exec(`ALTER TABLE storage_preferences ADD COLUMN document_storage_path TEXT NOT NULL DEFAULT '${escapedDefaultPath}'`);
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : '';
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw error;
    }
  }
}

async function migrateLegacyModelConfig(db: SqliteDb) {
  const marker = await db.get('SELECT value FROM settings_meta WHERE key = ?', ['legacy_model_config_migrated']);
  if (marker?.value === '1') {
    return;
  }

  const legacy = await db.get('SELECT base_url, llm_model, embedding_model, api_key, updated_at FROM model_config WHERE id = 1');
  if (legacy) {
    const apiKey = typeof legacy.api_key === 'string' ? legacy.api_key.trim() : '';
    await db.run(
      `UPDATE provider_configs
       SET base_url = ?, llm_model = ?, embedding_model = ?, api_key = ?, has_key = ?, updated_at = ?
       WHERE provider_id = 'siliconflow'`,
      [
        typeof legacy.base_url === 'string' ? legacy.base_url : 'https://api.siliconflow.cn/v1',
        typeof legacy.llm_model === 'string' ? legacy.llm_model : 'deepseek-ai/DeepSeek-V3',
        typeof legacy.embedding_model === 'string' ? legacy.embedding_model : 'BAAI/bge-m3',
        apiKey,
        apiKey ? 1 : 0,
        typeof legacy.updated_at === 'string' ? legacy.updated_at : nowIso(),
      ],
    );
  }

  await db.run(
    `INSERT INTO settings_meta (key, value)
     VALUES ('legacy_model_config_migrated', '1')
     ON CONFLICT(key) DO UPDATE SET value = '1'`,
  );
}

function mapProviderRow(row: any) {
  return {
    providerId: row.provider_id,
    version: row.version,
    baseUrl: row.base_url,
    llmModel: row.llm_model,
    embeddingModel: row.embedding_model,
    hasKey: Boolean(row.has_key),
    maskedKey: row.has_key ? toMaskedKey(row.api_key) : '',
    lastModelSyncAt: row.last_model_sync_at,
    updatedAt: row.updated_at,
  };
}

function mapStorageRow(row: any) {
  return {
    version: row.version,
    storagePath: row.storage_path,
    documentStoragePath: row.document_storage_path ?? row.storage_path,
    platform: row.platform,
    cacheSizeBytes: row.cache_size_bytes,
    freeSpaceBytes: row.free_space_bytes,
    updatedAt: row.updated_at,
  };
}

function mapProviderModelCatalogRow(row: any): ProviderModelCatalogItem {
  return {
    modelId: row.model_id,
    modelType: row.model_type,
    displayName: row.display_name,
    description: row.description,
    isOnline: Boolean(row.is_online),
    lastCheckedAt: row.last_checked_at,
  };
}

function toPreviewValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || typeof value === 'undefined') {
    return '';
  }
  return JSON.stringify(value);
}

function getDefaultProviderConfig(providerId: string) {
  return DEFAULT_PROVIDER_CONFIGS.find((item) => item.providerId === providerId);
}

async function getProviderOrThrow(db: SqliteDb, providerId: string) {
  const row = await db.get('SELECT * FROM provider_configs WHERE provider_id = ?', [providerId]);
  if (!row) {
    const error: any = new Error(`provider not found: ${providerId}`);
    error.status = 404;
    error.code = 'PROVIDER_NOT_FOUND';
    throw error;
  }
  return row;
}

async function syncLegacyModelConfig(db: SqliteDb, providerId: string, nextProviderRow: any) {
  if (providerId !== 'siliconflow') {
    return;
  }

  await db.run(
    `UPDATE model_config
     SET base_url = ?, llm_model = ?, embedding_model = ?, api_key = ?, updated_at = ?
     WHERE id = 1`,
    [
      nextProviderRow.base_url,
      nextProviderRow.llm_model,
      nextProviderRow.embedding_model,
      nextProviderRow.api_key,
      nextProviderRow.updated_at,
    ],
  );
}

export async function createSettingsStore(db: SqliteDb, options: CreateSettingsStoreOptions) {
  await ensureSchema(db, options);
  await migrateLegacyModelConfig(db);

  return {
    async getAllConfig() {
      const ui = await db.get('SELECT language, theme, updated_at FROM ui_preferences WHERE id = ?', [UI_ROW_ID]);
      const providerRows = await db.all('SELECT * FROM provider_configs ORDER BY provider_id ASC');
      const storage = await db.get('SELECT * FROM storage_preferences WHERE id = ?', [STORAGE_ROW_ID]);

      return {
        ui: {
          language: ui.language,
          theme: ui.theme,
          updatedAt: ui.updated_at,
        },
        providers: providerRows.map(mapProviderRow),
        storage: mapStorageRow(storage),
      };
    },

    async patchUiConfig(patch: UiPatch) {
      const current = await db.get('SELECT * FROM ui_preferences WHERE id = ?', [UI_ROW_ID]);
      const next = {
        language: typeof patch.language === 'string' ? patch.language : current.language,
        theme: typeof patch.theme === 'string' ? patch.theme : current.theme,
      };
      const updatedAt = nowIso();

      await db.run('UPDATE ui_preferences SET language = ?, theme = ?, updated_at = ? WHERE id = ?', [
        next.language,
        next.theme,
        updatedAt,
        UI_ROW_ID,
      ]);

      return {
        language: next.language,
        theme: next.theme,
        updatedAt,
      };
    },

    async patchProviderConfig(providerId: string, patch: ProviderPatch, expectedVersion: number) {
      const current = await getProviderOrThrow(db, providerId);
      if (current.version !== expectedVersion) {
        throw new ConfigConflictError();
      }

      const nextApiKey = typeof patch.apiKey === 'string' ? patch.apiKey.trim() : current.api_key;
      const next = {
        version: current.version + 1,
        baseUrl: typeof patch.baseUrl === 'string' ? patch.baseUrl : current.base_url,
        llmModel: typeof patch.llmModel === 'string' ? patch.llmModel : current.llm_model,
        embeddingModel: typeof patch.embeddingModel === 'string' ? patch.embeddingModel : current.embedding_model,
        apiKey: nextApiKey,
        hasKey: nextApiKey ? 1 : 0,
        updatedAt: nowIso(),
      };

      const result = await db.run(
        `UPDATE provider_configs
         SET version = ?, base_url = ?, llm_model = ?, embedding_model = ?, api_key = ?, has_key = ?, updated_at = ?
         WHERE provider_id = ? AND version = ?`,
        [
          next.version,
          next.baseUrl,
          next.llmModel,
          next.embeddingModel,
          next.apiKey,
          next.hasKey,
          next.updatedAt,
          providerId,
          expectedVersion,
        ],
      );

      if (!result?.changes) {
        throw new ConfigConflictError();
      }

      const updated = await getProviderOrThrow(db, providerId);
      await syncLegacyModelConfig(db, providerId, updated);
      return mapProviderRow(updated);
    },

    async patchStorageConfig(patch: StoragePatch, expectedVersion: number) {
      const current = await db.get('SELECT * FROM storage_preferences WHERE id = ?', [STORAGE_ROW_ID]);
      if (current.version !== expectedVersion) {
        throw new ConfigConflictError();
      }

      const nextStoragePath = typeof patch.storagePath === 'string' ? normalizeStoragePath(patch.storagePath) : current.storage_path;
      const nextDocumentStoragePath = typeof patch.documentStoragePath === 'string'
        ? normalizeStoragePath(patch.documentStoragePath)
        : (current.document_storage_path ?? current.storage_path);
      if (!nextStoragePath) {
        throw new InvalidStoragePathError();
      }
      if (!nextDocumentStoragePath) {
        throw new InvalidStoragePathError('documentStoragePath must be a non-empty string');
      }
      const updatedAt = nowIso();
      const result = await db.run(
        `UPDATE storage_preferences
         SET version = ?, storage_path = ?, document_storage_path = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
        [current.version + 1, nextStoragePath, nextDocumentStoragePath, updatedAt, STORAGE_ROW_ID, expectedVersion],
      );

      if (!result?.changes) {
        throw new ConfigConflictError();
      }

      const updated = await db.get('SELECT * FROM storage_preferences WHERE id = ?', [STORAGE_ROW_ID]);
      return mapStorageRow(updated);
    },

    async importConfig(payload: ImportPayload, dryRun: boolean) {
      const changesPreview: ImportChangeItem[] = [];
      const errors: Array<{ module: string; code: string; message: string; providerId?: string }> = [];

      const currentAll = await this.getAllConfig();

      const nextLanguage = payload.uiPreferences?.language;
      if (typeof nextLanguage === 'string' && nextLanguage !== currentAll.ui.language) {
        changesPreview.push({
          module: 'ui',
          field: 'language',
          from: currentAll.ui.language,
          to: nextLanguage,
        });
      }

      const nextTheme = payload.uiPreferences?.theme;
      if (typeof nextTheme === 'string' && nextTheme !== currentAll.ui.theme) {
        changesPreview.push({
          module: 'ui',
          field: 'theme',
          from: currentAll.ui.theme,
          to: nextTheme,
        });
      }

      if (Array.isArray(payload.providers)) {
        for (const candidate of payload.providers) {
          const providerId = typeof candidate?.providerId === 'string' ? candidate.providerId : '';
          if (!providerId) {
            continue;
          }

          const existingProvider = currentAll.providers.find((item) => item.providerId === providerId);
          if (!existingProvider) {
            errors.push({
              module: 'provider',
              providerId,
              code: 'PROVIDER_NOT_FOUND',
              message: `provider not found: ${providerId}`,
            });
            continue;
          }

          const fields: Array<keyof ImportProviderItem> = ['baseUrl', 'llmModel', 'embeddingModel'];
          for (const field of fields) {
            const incoming = candidate[field];
            if (typeof incoming !== 'string') {
              continue;
            }
            const previous = existingProvider[field] as string;
            if (incoming !== previous) {
              changesPreview.push({
                module: 'provider',
                providerId,
                field,
                from: toPreviewValue(previous),
                to: toPreviewValue(incoming),
              });
            }
          }
        }
      }

      const nextStoragePath = payload.storagePreferences?.storagePath;
      if (typeof nextStoragePath === 'string' && nextStoragePath !== currentAll.storage.storagePath) {
        changesPreview.push({
          module: 'storage',
          field: 'storagePath',
          from: currentAll.storage.storagePath,
          to: nextStoragePath,
        });
      }

      const nextDocumentStoragePath = payload.storagePreferences?.documentStoragePath;
      if (typeof nextDocumentStoragePath === 'string' && nextDocumentStoragePath !== currentAll.storage.documentStoragePath) {
        changesPreview.push({
          module: 'storage',
          field: 'documentStoragePath',
          from: currentAll.storage.documentStoragePath,
          to: nextDocumentStoragePath,
        });
      }

      if (errors.length > 0 || dryRun) {
        return {
          valid: errors.length === 0,
          changesPreview,
          errors,
        };
      }

      await db.exec('BEGIN TRANSACTION');
      try {
        if (typeof nextLanguage === 'string' || typeof nextTheme === 'string') {
          await this.patchUiConfig({
            language: nextLanguage,
            theme: nextTheme,
          });
        }

        if (Array.isArray(payload.providers)) {
          for (const candidate of payload.providers) {
            const providerId = typeof candidate?.providerId === 'string' ? candidate.providerId : '';
            if (!providerId) {
              continue;
            }

            const row = await getProviderOrThrow(db, providerId);
            await this.patchProviderConfig(
              providerId,
              {
                baseUrl: candidate.baseUrl,
                llmModel: candidate.llmModel,
                embeddingModel: candidate.embeddingModel,
              },
              row.version,
            );
          }
        }

        if (typeof nextStoragePath === 'string' || typeof nextDocumentStoragePath === 'string') {
          const storageRow = await db.get('SELECT version FROM storage_preferences WHERE id = ?', [STORAGE_ROW_ID]);
          await this.patchStorageConfig(
            {
              storagePath: nextStoragePath,
              documentStoragePath: nextDocumentStoragePath,
            },
            storageRow.version,
          );
        }

        await db.exec('COMMIT');
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }

      return {
        valid: true,
        changesPreview,
        errors,
      };
    },

    async resetDefaults(input: { scope: ResetScope; target?: ResetTarget; providerId?: string }) {
      const successItems: Array<{ module: string; target: string; providerId?: string }> = [];
      const failedItems: Array<{ module: string; target: string; providerId?: string; code: string; message: string }> = [];
      const warnings: string[] = [];

      const resetUi = async () => {
        await this.patchUiConfig({ language: DEFAULT_UI.language, theme: DEFAULT_UI.theme });
        successItems.push({ module: 'ui', target: 'ui' });
      };

      const resetProvider = async (providerId?: string) => {
        const all = await this.getAllConfig();
        const providerIds = providerId ? [providerId] : all.providers.map((item) => item.providerId);

        for (const currentProviderId of providerIds) {
          const defaults = getDefaultProviderConfig(currentProviderId);
          if (!defaults) {
            failedItems.push({
              module: 'provider',
              target: 'provider',
              providerId: currentProviderId,
              code: 'PROVIDER_NOT_FOUND',
              message: `provider not found: ${currentProviderId}`,
            });
            continue;
          }

          const row = await getProviderOrThrow(db, currentProviderId);
          await this.patchProviderConfig(
            currentProviderId,
            {
              baseUrl: defaults.baseUrl,
              llmModel: defaults.llmModel,
              embeddingModel: defaults.embeddingModel,
              apiKey: '',
            },
            row.version,
          );
          successItems.push({ module: 'provider', target: 'provider', providerId: currentProviderId });
        }
      };

      const resetStorage = async () => {
        const storage = await db.get('SELECT version FROM storage_preferences WHERE id = ?', [STORAGE_ROW_ID]);
        await this.patchStorageConfig(
          {
            storagePath: options.storagePath,
            documentStoragePath: options.documentStoragePath ?? options.storagePath,
          },
          storage.version,
        );
        successItems.push({ module: 'storage', target: 'storage' });
      };

      if (input.scope === 'all') {
        await resetUi();
        await resetProvider(input.providerId);
        await resetStorage();
        return { successItems, failedItems, warnings };
      }

      if (input.target === 'ui') {
        await resetUi();
      } else if (input.target === 'provider') {
        await resetProvider(input.providerId);
      } else if (input.target === 'storage') {
        await resetStorage();
      } else {
        warnings.push('target is required when scope=module');
        failedItems.push({
          module: 'reset',
          target: 'unknown',
          code: 'RESET_TARGET_REQUIRED',
          message: 'target is required when scope=module',
        });
      }

      return { successItems, failedItems, warnings };
    },

    async getProviderModelCatalog(providerId: string): Promise<ProviderModelCatalogItem[]> {
      const rows = await db.all(
        'SELECT * FROM provider_model_catalog WHERE provider_id = ? ORDER BY model_type ASC, model_id ASC',
        [providerId],
      );
      return rows.map(mapProviderModelCatalogRow);
    },

    async replaceProviderModelCatalog(providerId: string, models: ProviderModelCatalogItem[], lastCheckedAt: string) {
      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run('DELETE FROM provider_model_catalog WHERE provider_id = ?', [providerId]);

        for (const model of models) {
          await db.run(
            `INSERT INTO provider_model_catalog (provider_id, model_id, model_type, display_name, description, is_online, last_checked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              providerId,
              model.modelId,
              model.modelType,
              model.displayName,
              model.description,
              model.isOnline ? 1 : 0,
              model.lastCheckedAt,
            ],
          );
        }

        await db.run('UPDATE provider_configs SET last_model_sync_at = ?, updated_at = updated_at WHERE provider_id = ?', [
          lastCheckedAt,
          providerId,
        ]);

        await db.exec('COMMIT');
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    },

    async syncLegacyApiKey(apiKey: string) {
      const normalizedApiKey = apiKey.trim();
      const current = await getProviderOrThrow(db, 'siliconflow');
      const nextUpdatedAt = nowIso();

      await db.run(
        `UPDATE provider_configs
         SET version = ?, api_key = ?, has_key = ?, updated_at = ?
         WHERE provider_id = ?`,
        [current.version + 1, normalizedApiKey, normalizedApiKey ? 1 : 0, nextUpdatedAt, 'siliconflow'],
      );

      const nextProvider = await getProviderOrThrow(db, 'siliconflow');
      await syncLegacyModelConfig(db, 'siliconflow', nextProvider);
      return mapProviderRow(nextProvider);
    },
  };
}

type RegisterSettingsRoutesOptions = {
  storagePath: string;
  documentStoragePath?: string;
};

export function parseExpectedVersion(raw: unknown) {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    const error: any = new Error('expectedVersion must be a positive integer');
    error.status = 400;
    error.code = 'INVALID_VERSION';
    throw error;
  }
  return raw;
}

export function parseOptionalStoragePath(raw: unknown) {
  if (typeof raw === 'undefined') {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new InvalidStoragePathError();
  }

  const normalized = normalizeStoragePath(raw);
  if (!normalized) {
    throw new InvalidStoragePathError();
  }
  return normalized;
}

export function handleSettingsRouteError(error: any, res: express.Response) {
  const status = typeof error?.status === 'number' ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR';
  const message = typeof error?.message === 'string' ? error.message : 'unknown settings error';
  res.status(status).json({ code, message });
}

export async function getSettingsStore(db: SqliteDb, options: RegisterSettingsRoutesOptions) {
  return createSettingsStore(db, options);
}

export type SettingsStore = Awaited<ReturnType<typeof createSettingsStore>>;
