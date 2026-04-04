// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createDomainGuard } from './domain-guard.ts';

describe('createDomainGuard', () => {
  it('applies DNS timeout=2s and maxRetries=2 for custom domain checks', async () => {
    const resolver = vi.fn(async () => ['10.0.0.8']);
    const guard = createDomainGuard({ resolver });

    await guard.assessHostname('internal.example.local');

    expect(resolver).toHaveBeenCalledWith('internal.example.local', {
      timeoutMs: 2000,
      maxRetries: 2,
    });
  });

  it('uses 60s DNS cache TTL and rejects unstable rebinding results', async () => {
    const resolver = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(['10.0.0.8'])
      .mockResolvedValueOnce(['10.0.0.8'])
      .mockResolvedValueOnce(['10.0.0.8'])
      .mockResolvedValueOnce(['8.8.8.8']);

    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_020)
      .mockReturnValueOnce(62_000)
      .mockReturnValueOnce(62_050);

    const guard = createDomainGuard({ resolver, now });

    const cached = await guard.assessHostname('stable.example.local');
    expect(cached.decision).toBe('allow_http_private');

    const withinTtl = await guard.assessHostname('stable.example.local');
    expect(withinTtl.decision).toBe('allow_http_private');
    expect(resolver).toHaveBeenCalledTimes(2);

    const unstable = await guard.assessHostname('stable.example.local');
    expect(unstable.decision).toBe('reject');
    expect(unstable.code).toBe('CONFIG_URL_INVALID');
    expect(unstable.reason).toBe('UNSTABLE_DNS_REBINDING');
  });
});
