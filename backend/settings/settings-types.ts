export const PROVIDER_IDS = ['siliconflow', 'openai', 'gemini', 'custom_compatible'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ValidationErrorCode = 'CONFIG_URL_INVALID' | 'API_KEY_INVALID_FORMAT';

export type ValidationWarningCode = 'CONFIG_INSECURE_HTTP_ALLOWED';

export type ValidationField = 'baseUrl' | 'apiKey';

export interface ValidationIssue<TCode extends string> {
  code: TCode;
  field: ValidationField;
  message: string;
}

export interface ProviderSettingsInput {
  providerId: ProviderId;
  baseUrl: string;
  apiKey: string;
}

export interface ProviderValidationResult {
  valid: boolean;
  errors: ValidationIssue<ValidationErrorCode>[];
  warnings: ValidationIssue<ValidationWarningCode>[];
}
