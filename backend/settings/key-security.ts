import crypto from 'node:crypto';

export const KEY_TOKEN_USED = 'KEY_TOKEN_USED';
export const KEY_TOKEN_EXPIRED = 'KEY_TOKEN_EXPIRED';
export const KEY_TOKEN_PROVIDER_MISMATCH = 'KEY_TOKEN_PROVIDER_MISMATCH';
export const KEY_REVEAL_RATE_LIMITED = 'KEY_REVEAL_RATE_LIMITED';

const DEFAULT_TOKEN_TTL_MS = 60_000;
const DEFAULT_REVEAL_LIMIT_PER_MINUTE = 5;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_AUDIT_RETENTION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

type RevealAction = 'reveal' | 'copy';

type TokenRecord = {
  providerId: string;
  expiresAtMs: number;
  usedAtMs: number | null;
};

type DeletedTokenReason = 'used' | 'expired';

type DeletedTokenRecord = {
  reason: DeletedTokenReason;
  markedAtMs: number;
};

type RateLimitRecord = {
  windowStartedAtMs: number;
  count: number;
};

export type KeySecurityAuditEvent = {
  requestId: string;
  providerId: string;
  actor: string;
  action: RevealAction;
  result: 'success' | 'error';
  code?: string;
  timestamp: string;
};

type RevealInput = {
  providerId: string;
  token: string;
  action: RevealAction;
  requestId: string;
  actor: string;
  loadProviderKey: () => Promise<string>;
};

type CreateKeySecurityServiceOptions = {
  now?: () => number;
  tokenTtlMs?: number;
  revealLimitPerMinute?: number;
  rateWindowMs?: number;
  auditRetentionDays?: number;
};

type KeySecurityService = {
  issueToken: (providerId: string) => { token: string; expiresInSeconds: number };
  revealKey: (input: RevealInput) => Promise<{ plainKey: string }>;
  getAuditEvents: () => KeySecurityAuditEvent[];
  purgeExpiredAuditEvents: () => number;
  getTokenStoreSize: () => number;
};

class KeySecurityError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'KeySecurityError';
    this.code = code;
    this.status = status;
  }
}

export function createKeySecurityService(options: CreateKeySecurityServiceOptions = {}): KeySecurityService {
  const now = options.now ?? (() => Date.now());
  const tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
  const revealLimitPerMinute = options.revealLimitPerMinute ?? DEFAULT_REVEAL_LIMIT_PER_MINUTE;
  const rateWindowMs = options.rateWindowMs ?? DEFAULT_RATE_WINDOW_MS;
  const auditRetentionMs = (options.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS) * DAY_MS;

  const tokenStore = new Map<string, TokenRecord>();
  const deletedTokenStore = new Map<string, DeletedTokenRecord>();
  const rateLimitStore = new Map<string, RateLimitRecord>();
  const auditEvents: KeySecurityAuditEvent[] = [];

  function pruneDeletedTokenStore() {
    const cutoff = now() - tokenTtlMs;
    for (const [token, record] of deletedTokenStore.entries()) {
      if (record.markedAtMs < cutoff) {
        deletedTokenStore.delete(token);
      }
    }
  }

  function markDeletedToken(token: string, reason: DeletedTokenReason) {
    deletedTokenStore.set(token, {
      reason,
      markedAtMs: now(),
    });
  }

  function purgeExpiredTokens() {
    const current = now();
    for (const [token, record] of tokenStore.entries()) {
      if (record.usedAtMs !== null) {
        tokenStore.delete(token);
        markDeletedToken(token, 'used');
        continue;
      }

      if (record.expiresAtMs < current) {
        tokenStore.delete(token);
        markDeletedToken(token, 'expired');
      }
    }
    pruneDeletedTokenStore();
  }

  function purgeExpiredAuditEvents() {
    const cutoff = now() - auditRetentionMs;
    const next = auditEvents.filter((event) => Date.parse(event.timestamp) >= cutoff);
    const removed = auditEvents.length - next.length;
    auditEvents.length = 0;
    auditEvents.push(...next);
    return removed;
  }

  function ensureRateLimit(providerId: string) {
    const current = now();
    const currentRecord = rateLimitStore.get(providerId);
    if (!currentRecord || current - currentRecord.windowStartedAtMs >= rateWindowMs) {
      rateLimitStore.set(providerId, {
        windowStartedAtMs: current,
        count: 1,
      });
      return;
    }

    if (currentRecord.count >= revealLimitPerMinute) {
      throw new KeySecurityError(KEY_REVEAL_RATE_LIMITED, 429, 'too many reveal/copy requests for provider');
    }
    currentRecord.count += 1;
  }

  function consumeToken(providerId: string, token: string) {
    const record = tokenStore.get(token);
    if (!record) {
      const deleted = deletedTokenStore.get(token);
      if (deleted?.reason === 'expired') {
        throw new KeySecurityError(KEY_TOKEN_EXPIRED, 410, 'token expired');
      }
      throw new KeySecurityError(KEY_TOKEN_USED, 409, 'token already used');
    }

    if (record.providerId !== providerId) {
      throw new KeySecurityError(KEY_TOKEN_PROVIDER_MISMATCH, 400, 'token provider mismatch');
    }

    if (record.usedAtMs !== null) {
      throw new KeySecurityError(KEY_TOKEN_USED, 409, 'token already used');
    }

    if (record.expiresAtMs < now()) {
      tokenStore.delete(token);
      markDeletedToken(token, 'expired');
      throw new KeySecurityError(KEY_TOKEN_EXPIRED, 410, 'token expired');
    }

    record.usedAtMs = now();
    tokenStore.delete(token);
    markDeletedToken(token, 'used');
  }

  function appendAuditEvent(input: Omit<KeySecurityAuditEvent, 'timestamp'>) {
    auditEvents.push({
      ...input,
      timestamp: new Date(now()).toISOString(),
    });
  }

  return {
    issueToken(providerId: string) {
      purgeExpiredTokens();
      purgeExpiredAuditEvents();

      const token = crypto.randomBytes(24).toString('hex');
      tokenStore.set(token, {
        providerId,
        expiresAtMs: now() + tokenTtlMs,
        usedAtMs: null,
      });

      return {
        token,
        expiresInSeconds: Math.floor(tokenTtlMs / 1000),
      };
    },

    async revealKey(input: RevealInput) {
      purgeExpiredTokens();
      purgeExpiredAuditEvents();

      try {
        ensureRateLimit(input.providerId);
        consumeToken(input.providerId, input.token);
        const plainKey = (await input.loadProviderKey()).trim();

        appendAuditEvent({
          requestId: input.requestId,
          providerId: input.providerId,
          actor: input.actor,
          action: input.action,
          result: 'success',
        });

        return { plainKey };
      } catch (error: any) {
        appendAuditEvent({
          requestId: input.requestId,
          providerId: input.providerId,
          actor: input.actor,
          action: input.action,
          result: 'error',
          code: typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
        });
        throw error;
      }
    },

    getAuditEvents() {
      return [...auditEvents];
    },

    purgeExpiredAuditEvents,

    getTokenStoreSize() {
      return tokenStore.size;
    },
  };
}

export type { CreateKeySecurityServiceOptions, KeySecurityService, RevealAction };
