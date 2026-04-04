import { describe, expect, it } from 'vitest';
import {
  validateProviderDraft,
  validateSettingsDraft,
  type ProviderDraft,
  type SettingsDraft,
} from './validators.ts';

function createProviderDraft(overrides: Partial<ProviderDraft> = {}): ProviderDraft {
  return {
    providerId: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-1234567890abcdef',
    llmModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    ...overrides,
  };
}

describe('validateProviderDraft', () => {
  it('rejects non-https for openai/siliconflow/gemini', () => {
    const providers = ['openai', 'siliconflow', 'gemini'] as const;
    for (const providerId of providers) {
      const result = validateProviderDraft(
        createProviderDraft({
          providerId,
          baseUrl: 'http://api.example.com/v1',
          apiKey: providerId === 'gemini' ? 'AIza12345678901234567890' : 'sk-1234567890abcdef',
        }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'CONFIG_URL_INVALID', field: 'baseUrl' }),
        ]),
      );
    }
  });

  it('allows custom http localhost/private network with risk warning', () => {
    const localhost = validateProviderDraft(
      createProviderDraft({
        providerId: 'custom_compatible',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'custom-compatible-key',
      }),
    );

    expect(localhost.valid).toBe(true);
    expect(localhost.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONFIG_INSECURE_HTTP_ALLOWED', field: 'baseUrl' }),
      ]),
    );

    const privateIpv4 = validateProviderDraft(
      createProviderDraft({
        providerId: 'custom_compatible',
        baseUrl: 'http://192.168.0.18:11434/v1',
        apiKey: 'custom-compatible-key',
      }),
    );

    expect(privateIpv4.valid).toBe(true);
    expect(privateIpv4.warnings).toHaveLength(1);
  });

  it('allows custom http private-domain with risk warning', () => {
    const privateDomain = validateProviderDraft(
      createProviderDraft({
        providerId: 'custom_compatible',
        baseUrl: 'http://intranet.example.local/v1',
        apiKey: 'custom-compatible-key',
      }),
    );

    expect(privateDomain.valid).toBe(true);
    expect(privateDomain.errors).toHaveLength(0);
    expect(privateDomain.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONFIG_INSECURE_HTTP_ALLOWED',
          field: 'baseUrl',
          providerId: 'custom_compatible',
        }),
      ]),
    );
  });

  it('allows custom http for ipv6 loopback/private/link-local with risk warning', () => {
    const urls = ['http://[::1]:11434/v1', 'http://[fd12:3456::1]:11434/v1', 'http://[fe80::1]:11434/v1'];

    for (const baseUrl of urls) {
      const result = validateProviderDraft(
        createProviderDraft({
          providerId: 'custom_compatible',
          baseUrl,
          apiKey: 'custom-compatible-key',
        }),
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'CONFIG_INSECURE_HTTP_ALLOWED',
            field: 'baseUrl',
            providerId: 'custom_compatible',
          }),
        ]),
      );
    }
  });

  it('rejects custom http public domain', () => {
    const result = validateProviderDraft(
      createProviderDraft({
        providerId: 'custom_compatible',
        baseUrl: 'http://public.example.com/v1',
        apiKey: 'custom-compatible-key',
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONFIG_URL_INVALID', field: 'baseUrl' }),
      ]),
    );
  });

  it('returns provider-specific key format errors', () => {
    const openai = validateProviderDraft(
      createProviderDraft({
        providerId: 'openai',
        apiKey: 'invalid',
      }),
    );
    expect(openai.valid).toBe(false);
    expect(openai.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'API_KEY_INVALID_FORMAT', field: 'apiKey' }),
      ]),
    );

    const gemini = validateProviderDraft(
      createProviderDraft({
        providerId: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'sk-not-gemini',
      }),
    );
    expect(gemini.valid).toBe(false);
    expect(gemini.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'API_KEY_INVALID_FORMAT', field: 'apiKey' }),
      ]),
    );
  });
});

describe('validateSettingsDraft', () => {
  it('aggregates validation issues for UI consumption', () => {
    const draft: SettingsDraft = {
      ui: { language: 'zh-CN', theme: 'system' },
      providers: [
        createProviderDraft({
          providerId: 'openai',
          baseUrl: 'http://api.openai.com/v1',
          apiKey: 'invalid',
        }),
      ],
      storage: {
        storagePath: '/tmp/kb',
        documentStoragePath: '/tmp/kb-docs',
      },
    };

    const result = validateSettingsDraft(draft);

    expect(result.valid).toBe(false);
    expect(result.byModule.provider.errors).toHaveLength(2);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: 'provider', field: 'baseUrl', code: 'CONFIG_URL_INVALID' }),
        expect.objectContaining({ module: 'provider', field: 'apiKey', code: 'API_KEY_INVALID_FORMAT' }),
      ]),
    );
  });
});
