export const PROVIDER_IDS = ['siliconflow', 'openai', 'gemini', 'custom_compatible'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ValidationErrorCode = 'CONFIG_URL_INVALID' | 'API_KEY_INVALID_FORMAT';
export type ValidationWarningCode = 'CONFIG_INSECURE_HTTP_ALLOWED';

export type ProviderField = 'baseUrl' | 'apiKey' | 'llmModel' | 'embeddingModel';
export type UiField = 'language' | 'theme';
export type StorageField = 'storagePath' | 'documentStoragePath';

export interface ProviderIssue<TCode extends string = string> {
  providerId: ProviderId;
  field: ProviderField;
  code: TCode;
  message: string;
}

export interface ProviderDraft {
  providerId: ProviderId;
  baseUrl: string;
  apiKey: string;
  llmModel: string;
  embeddingModel: string;
}

export interface UiDraft {
  language: string;
  theme: string;
}

export interface StorageDraft {
  storagePath: string;
  documentStoragePath: string;
}

export interface SettingsDraft {
  ui: UiDraft;
  providers: ProviderDraft[];
  storage: StorageDraft;
}

export type ProviderPatchFields = Partial<Pick<ProviderDraft, ProviderField>>;
export type UiPatchFields = Partial<Pick<UiDraft, UiField>>;
export type StoragePatchFields = Partial<Pick<StorageDraft, StorageField>>;

export interface ProviderValidationResult {
  valid: boolean;
  errors: ProviderIssue<ValidationErrorCode>[];
  warnings: ProviderIssue<ValidationWarningCode>[];
}

export interface AggregatedIssue {
  module: 'provider' | 'storage' | 'ui';
  providerId?: ProviderId;
  field: string;
  code: string;
  message: string;
}

export interface SettingsValidationResult {
  valid: boolean;
  errors: AggregatedIssue[];
  warnings: AggregatedIssue[];
  byModule: {
    provider: {
      errors: AggregatedIssue[];
      warnings: AggregatedIssue[];
    };
    storage: {
      errors: AggregatedIssue[];
      warnings: AggregatedIssue[];
    };
    ui: {
      errors: AggregatedIssue[];
      warnings: AggregatedIssue[];
    };
  };
}

export interface SettingsExportPayload {
  schemaVersion: string;
  exportedAt?: string;
  uiPreferences?: UiDraft;
  providers?: Array<ProviderDraft & { version?: number; hasKey?: boolean; maskedKey?: string }>;
  storagePreferences?: StorageDraft & { version?: number };
}

export interface SettingsImportRequest {
  schemaVersion: string;
  payload: {
    uiPreferences?: Partial<UiDraft>;
    providers?: Array<Partial<ProviderDraft> & { providerId?: ProviderId }>;
    storagePreferences?: Partial<StorageDraft>;
  };
  dryRun: boolean;
}
