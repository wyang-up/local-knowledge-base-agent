import { createDomainGuard, isLocalOrPrivateAddress } from './domain-guard.ts';
import type { DomainGuard } from './domain-guard.ts';
import type {
  ProviderId,
  ProviderSettingsInput,
  ProviderValidationResult,
  ValidationIssue,
} from './settings-types.ts';

const OPENAI_STYLE_KEY_REGEX = /^sk-[A-Za-z0-9-_]{16,}$/;
const GEMINI_KEY_REGEX = /^AIza[0-9A-Za-z-_]{20,}$/;
const CUSTOM_KEY_REGEX = /^[\s\S]{12,}$/;

type WarningIssue = ValidationIssue<'CONFIG_INSECURE_HTTP_ALLOWED'>;
type ErrorIssue = ValidationIssue<'CONFIG_URL_INVALID' | 'API_KEY_INVALID_FORMAT'>;

const sharedDomainGuard = createDomainGuard();

interface ValidationDeps {
  domainGuard?: DomainGuard;
}

export async function validateProviderSettings(
  input: ProviderSettingsInput,
  deps: ValidationDeps = {},
): Promise<ProviderValidationResult> {
  const errors: ErrorIssue[] = [];
  const warnings: WarningIssue[] = [];

  const parsedUrl = parseUrl(input.baseUrl);
  if (!parsedUrl) {
    errors.push({
      code: 'CONFIG_URL_INVALID',
      field: 'baseUrl',
      message: 'BASE URL is not a valid URL.',
    });
  } else {
    await validateProtocol({
      providerId: input.providerId,
      parsedUrl,
      errors,
      warnings,
      domainGuard: deps.domainGuard ?? sharedDomainGuard,
    });
  }

  if (!isValidApiKey(input.providerId, input.apiKey)) {
    errors.push({
      code: 'API_KEY_INVALID_FORMAT',
      field: 'apiKey',
      message: `API key format is invalid for provider '${input.providerId}'.`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function parseUrl(baseUrl: string): URL | null {
  try {
    return new URL(baseUrl);
  } catch {
    return null;
  }
}

function isStrictHttpsProvider(providerId: ProviderId): boolean {
  return providerId === 'openai' || providerId === 'siliconflow' || providerId === 'gemini';
}

function isValidApiKey(providerId: ProviderId, apiKey: string): boolean {
  switch (providerId) {
    case 'openai':
    case 'siliconflow':
      return OPENAI_STYLE_KEY_REGEX.test(apiKey);
    case 'gemini':
      return GEMINI_KEY_REGEX.test(apiKey);
    case 'custom_compatible':
      return CUSTOM_KEY_REGEX.test(apiKey);
    default:
      return false;
  }
}

async function validateProtocol(params: {
  providerId: ProviderId;
  parsedUrl: URL;
  errors: ErrorIssue[];
  warnings: WarningIssue[];
  domainGuard: DomainGuard;
}): Promise<void> {
  const { providerId, parsedUrl, errors, warnings, domainGuard } = params;
  const protocol = parsedUrl.protocol.toLowerCase();

  if (isStrictHttpsProvider(providerId)) {
    if (protocol !== 'https:') {
      errors.push({
        code: 'CONFIG_URL_INVALID',
        field: 'baseUrl',
        message: `${providerId} requires https:// BASE URL.`,
      });
    }
    return;
  }

  if (providerId !== 'custom_compatible') {
    return;
  }

  if (protocol === 'https:') {
    return;
  }

  if (protocol !== 'http:') {
    errors.push({
      code: 'CONFIG_URL_INVALID',
      field: 'baseUrl',
      message: 'BASE URL must use http:// or https://.',
    });
    return;
  }

  const host = normalizeHost(parsedUrl.hostname);
  if (isLocalOrPrivateAddress(host)) {
    warnings.push({
      code: 'CONFIG_INSECURE_HTTP_ALLOWED',
      field: 'baseUrl',
      message: 'HTTP is allowed only for localhost/private network in custom_compatible mode.',
    });
    return;
  }

  const domainDecision = await domainGuard.assessHostname(host);
  if (domainDecision.decision === 'allow_http_private') {
    warnings.push({
      code: 'CONFIG_INSECURE_HTTP_ALLOWED',
      field: 'baseUrl',
      message: 'HTTP is allowed only for private-network domains in custom_compatible mode.',
    });
    return;
  }

  errors.push({
    code: 'CONFIG_URL_INVALID',
    field: 'baseUrl',
    message: 'HTTP custom endpoint must resolve to private-network addresses with stable DNS.',
  });
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}
