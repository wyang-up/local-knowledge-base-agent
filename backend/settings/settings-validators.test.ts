// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { validateProviderSettings } from './settings-validators.ts';

describe('validateProviderSettings', () => {
  it('rejects non-https for openai/siliconflow/gemini', async () => {
    const providers = ['openai', 'siliconflow', 'gemini'] as const;

    for (const providerId of providers) {
      const result = await validateProviderSettings({
        providerId,
        baseUrl: 'http://api.example.com/v1',
        apiKey: providerId === 'gemini' ? 'AIza12345678901234567890' : 'sk-1234567890abcdef',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'CONFIG_URL_INVALID',
            field: 'baseUrl',
          }),
        ]),
      );
    }
  });

  it('allows custom http localhost/private network with risk flag', async () => {
    const localhost = await validateProviderSettings({
      providerId: 'custom_compatible',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'custom-key-12345',
    });
    expect(localhost.valid).toBe(true);
    expect(localhost.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONFIG_INSECURE_HTTP_ALLOWED',
          field: 'baseUrl',
        }),
      ]),
    );

    const privateNetwork = await validateProviderSettings({
      providerId: 'custom_compatible',
      baseUrl: 'http://192.168.1.20:8000/v1',
      apiKey: 'custom-key-12345',
    });
    expect(privateNetwork.valid).toBe(true);
    expect(privateNetwork.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONFIG_INSECURE_HTTP_ALLOWED',
          field: 'baseUrl',
        }),
      ]),
    );

    const ipv6Loopback = await validateProviderSettings({
      providerId: 'custom_compatible',
      baseUrl: 'http://[::1]:11434/v1',
      apiKey: 'custom-key-12345',
    });
    expect(ipv6Loopback.valid).toBe(true);
    expect(ipv6Loopback.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONFIG_INSECURE_HTTP_ALLOWED',
          field: 'baseUrl',
        }),
      ]),
    );
  });

  it('rejects custom_compatible http public domain with controlled domain guard', async () => {
    const assessHostname = vi.fn(async () => ({
      decision: 'reject' as const,
      code: 'CONFIG_URL_INVALID' as const,
      reason: 'PUBLIC_NETWORK_RESOLVED' as const,
    }));

    const result = await validateProviderSettings(
      {
        providerId: 'custom_compatible',
        baseUrl: 'http://public.example.com/v1',
        apiKey: 'custom-key-12345',
      },
      {
        domainGuard: {
          assessHostname,
        },
      },
    );

    expect(assessHostname).toHaveBeenCalledWith('public.example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONFIG_URL_INVALID', field: 'baseUrl' }),
      ]),
    );
  });

  it('accepts custom domain when injected domain guard allows private http', async () => {
    const assessHostname = vi.fn(async () => ({
      decision: 'allow_http_private' as const,
      addresses: ['10.0.0.8'],
    }));

    const result = await validateProviderSettings(
      {
        providerId: 'custom_compatible',
        baseUrl: 'http://intranet.example.local/v1',
        apiKey: 'custom-key-12345',
      },
      {
        domainGuard: {
          assessHostname,
        },
      },
    );

    expect(assessHostname).toHaveBeenCalledWith('intranet.example.local');
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONFIG_INSECURE_HTTP_ALLOWED', field: 'baseUrl' }),
      ]),
    );
  });

  it('rejects invalid protocol for custom_compatible', async () => {
    const result = await validateProviderSettings({
      providerId: 'custom_compatible',
      baseUrl: 'ftp://localhost:11434/v1',
      apiKey: 'custom-key-12345',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONFIG_URL_INVALID', field: 'baseUrl' }),
      ]),
    );
  });

  it('rejects invalid url format', async () => {
    const result = await validateProviderSettings({
      providerId: 'custom_compatible',
      baseUrl: 'not-a-valid-url',
      apiKey: 'custom-key-12345',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONFIG_URL_INVALID', field: 'baseUrl' }),
      ]),
    );
  });

  it('reuses provided domain guard instance across validations', async () => {
    const assessHostname = vi.fn(async () => ({
      decision: 'allow_http_private' as const,
      addresses: ['10.0.0.8'],
    }));
    const domainGuard = { assessHostname };

    await validateProviderSettings(
      {
        providerId: 'custom_compatible',
        baseUrl: 'http://same.example.local/v1',
        apiKey: 'custom-key-12345',
      },
      { domainGuard },
    );

    await validateProviderSettings(
      {
        providerId: 'custom_compatible',
        baseUrl: 'http://same.example.local/v1',
        apiKey: 'custom-key-12345',
      },
      { domainGuard },
    );

    expect(assessHostname).toHaveBeenCalledTimes(2);
  });

  it('returns provider-specific key format errors', async () => {
    const openai = await validateProviderSettings({
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'invalid-key',
    });
    expect(openai.valid).toBe(false);
    expect(openai.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'API_KEY_INVALID_FORMAT', field: 'apiKey' }),
      ]),
    );

    const gemini = await validateProviderSettings({
      providerId: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'sk-not-a-gemini-key',
    });
    expect(gemini.valid).toBe(false);
    expect(gemini.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'API_KEY_INVALID_FORMAT', field: 'apiKey' }),
      ]),
    );
  });
});
