import { promises as dns } from 'node:dns';

export const DNS_TIMEOUT_MS = 2000;
export const DNS_MAX_RETRIES = 2;
export const DNS_CACHE_TTL_MS = 60_000;

export interface ResolveOptions {
  timeoutMs: number;
  maxRetries: number;
}

export type ResolveDomainFn = (hostname: string, options: ResolveOptions) => Promise<string[]>;

export interface DomainGuardResult {
  decision: 'allow_http_private' | 'reject';
  code?: 'CONFIG_URL_INVALID';
  reason?: 'DNS_RESOLUTION_FAILED' | 'PUBLIC_NETWORK_RESOLVED' | 'UNSTABLE_DNS_REBINDING';
  addresses?: string[];
}

export interface DomainGuard {
  assessHostname(hostname: string): Promise<DomainGuardResult>;
}

interface CacheEntry {
  expiresAt: number;
  result: DomainGuardResult;
}

interface DomainGuardOptions {
  resolver?: ResolveDomainFn;
  now?: () => number;
}

export function createDomainGuard(options: DomainGuardOptions = {}): DomainGuard {
  const resolver = options.resolver ?? resolveDomainRecords;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  return {
    async assessHostname(hostname: string): Promise<DomainGuardResult> {
      const normalizedHost = hostname.trim().toLowerCase();
      const cached = cache.get(normalizedHost);

      if (cached && now() < cached.expiresAt) {
        return cached.result;
      }

      let firstResolution: string[];
      let secondResolution: string[];
      try {
        firstResolution = await resolver(normalizedHost, {
          timeoutMs: DNS_TIMEOUT_MS,
          maxRetries: DNS_MAX_RETRIES,
        });
        secondResolution = await resolver(normalizedHost, {
          timeoutMs: DNS_TIMEOUT_MS,
          maxRetries: DNS_MAX_RETRIES,
        });
      } catch {
        const failed: DomainGuardResult = {
          decision: 'reject',
          code: 'CONFIG_URL_INVALID',
          reason: 'DNS_RESOLUTION_FAILED',
        };
        cache.set(normalizedHost, { result: failed, expiresAt: now() + DNS_CACHE_TTL_MS });
        return failed;
      }

      const first = normalizeAddresses(firstResolution);
      const second = normalizeAddresses(secondResolution);

      if (!sameAddressSet(first, second)) {
        const unstable: DomainGuardResult = {
          decision: 'reject',
          code: 'CONFIG_URL_INVALID',
          reason: 'UNSTABLE_DNS_REBINDING',
          addresses: first,
        };
        cache.set(normalizedHost, { result: unstable, expiresAt: now() + DNS_CACHE_TTL_MS });
        return unstable;
      }

      if (first.length === 0 || first.some((ip) => !isPrivateIpv4(ip))) {
        const rejected: DomainGuardResult = {
          decision: 'reject',
          code: 'CONFIG_URL_INVALID',
          reason: 'PUBLIC_NETWORK_RESOLVED',
          addresses: first,
        };
        cache.set(normalizedHost, { result: rejected, expiresAt: now() + DNS_CACHE_TTL_MS });
        return rejected;
      }

      const allowed: DomainGuardResult = {
        decision: 'allow_http_private',
        addresses: first,
      };
      cache.set(normalizedHost, { result: allowed, expiresAt: now() + DNS_CACHE_TTL_MS });
      return allowed;
    },
  };
}

export async function resolveDomainRecords(hostname: string, options: ResolveOptions): Promise<string[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt < options.maxRetries; attempt += 1) {
    try {
      const result = await withTimeout(dns.resolve4(hostname), options.timeoutMs);
      return normalizeAddresses(result);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('DNS resolution failed');
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('DNS timeout'));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function normalizeAddresses(addresses: string[]): string[] {
  return Array.from(new Set(addresses.map((item) => item.trim()))).sort();
}

function sameAddressSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 4 || parts.some((segment) => Number.isNaN(segment) || segment < 0 || segment > 255)) {
    return false;
  }

  if (parts[0] === 10) {
    return true;
  }

  if (parts[0] === 127) {
    return true;
  }

  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }

  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  return false;
}

export function isLocalOrPrivateAddress(hostname: string): boolean {
  const normalizedHost = hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  if (normalizedHost === 'localhost' || normalizedHost === '::1') {
    return true;
  }

  return isPrivateIpv4(normalizedHost);
}
