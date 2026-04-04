import type {
  ProviderDraft,
  ProviderId,
  ProviderValidationResult,
  SettingsDraft,
  SettingsValidationResult,
} from './types.ts';

export type { ProviderDraft, SettingsDraft } from './types.ts';

const OPENAI_STYLE_KEY_REGEX = /^sk-[A-Za-z0-9-_]{16,}$/;
const GEMINI_KEY_REGEX = /^AIza[0-9A-Za-z-_]{20,}$/;
const CUSTOM_KEY_REGEX = /^[\s\S]{12,}$/;

export function validateProviderDraft(input: ProviderDraft): ProviderValidationResult {
  const errors: ProviderValidationResult['errors'] = [];
  const warnings: ProviderValidationResult['warnings'] = [];

  const parsedUrl = parseUrl(input.baseUrl);
  if (!parsedUrl) {
    errors.push({
      providerId: input.providerId,
      code: 'CONFIG_URL_INVALID',
      field: 'baseUrl',
      message: 'BASE URL is not a valid URL.',
    });
  } else {
    validateProtocol(input.providerId, parsedUrl, errors, warnings);
  }

  if (!isValidApiKey(input.providerId, input.apiKey)) {
    errors.push({
      providerId: input.providerId,
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

export function validateSettingsDraft(draft: SettingsDraft): SettingsValidationResult {
  const errors: SettingsValidationResult['errors'] = [];
  const warnings: SettingsValidationResult['warnings'] = [];

  for (const provider of draft.providers) {
    const result = validateProviderDraft(provider);
    for (const issue of result.errors) {
      errors.push({ module: 'provider', ...issue });
    }
    for (const issue of result.warnings) {
      warnings.push({ module: 'provider', ...issue });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    byModule: {
      provider: {
        errors: errors.filter((issue) => issue.module === 'provider'),
        warnings: warnings.filter((issue) => issue.module === 'provider'),
      },
      storage: { errors: [], warnings: [] },
      ui: { errors: [], warnings: [] },
    },
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

function validateProtocol(
  providerId: ProviderId,
  parsedUrl: URL,
  errors: ProviderValidationResult['errors'],
  warnings: ProviderValidationResult['warnings'],
) {
  const protocol = parsedUrl.protocol.toLowerCase();

  if (isStrictHttpsProvider(providerId)) {
    if (protocol !== 'https:') {
      errors.push({
        providerId,
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
      providerId,
      code: 'CONFIG_URL_INVALID',
      field: 'baseUrl',
      message: 'BASE URL must use http:// or https://.',
    });
    return;
  }

  const host = normalizeHost(parsedUrl.hostname);
  if (isLocalOrPrivateAddress(host) || isLikelyPrivateDomain(host)) {
    warnings.push({
      providerId,
      code: 'CONFIG_INSECURE_HTTP_ALLOWED',
      field: 'baseUrl',
      message: 'HTTP is allowed only for localhost/private network in custom_compatible mode.',
    });
    return;
  }

  errors.push({
    providerId,
    code: 'CONFIG_URL_INVALID',
    field: 'baseUrl',
    message: 'HTTP custom endpoint must resolve to private-network addresses with stable DNS.',
  });
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function isLocalOrPrivateAddress(host: string): boolean {
  if (!host) {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return true;
  }

  if (isLocalOrPrivateIpv6(host)) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map(Number);
  if (octets.some((part) => part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10 || a === 127) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return a === 172 && b >= 16 && b <= 31;
}

function isLocalOrPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (!normalized.includes(':')) {
    return false;
  }

  if (normalized === '::1') {
    return true;
  }

  const firstHextet = readFirstHextet(normalized);
  if (firstHextet === null) {
    return false;
  }

  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) {
    return true;
  }

  return firstHextet >= 0xfe80 && firstHextet <= 0xfebf;
}

function readFirstHextet(host: string): number | null {
  const firstSegment = host.split(':')[0];
  if (!firstSegment) {
    return 0;
  }

  if (!/^[0-9a-f]{1,4}$/.test(firstSegment)) {
    return null;
  }

  return Number.parseInt(firstSegment, 16);
}

function isLikelyPrivateDomain(host: string): boolean {
  if (!host || host.includes(':')) {
    return false;
  }

  return (
    host.endsWith('.local') ||
    host.endsWith('.lan') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  );
}
