import crypto from 'node:crypto';
import type express from 'express';

export const SETTINGS_SESSION_HEADER = 'x-settings-session';
export const SETTINGS_CSRF_HEADER = 'x-csrf-token';
export const SETTINGS_REQUEST_ID_HEADER = 'x-request-id';
export const LOCAL_ACTOR = 'local-single-user';

const isProductionEnv = process.env.NODE_ENV === 'production';
const DEV_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const DEV_CSRF_SECRET = crypto.randomBytes(32).toString('hex');

type RouteMethod = 'GET' | 'PATCH' | 'POST';

type ProtectedRouteDefinition = {
  method: RouteMethod;
  path: string;
  examplePath: string;
};

type ProtectedRoute = ProtectedRouteDefinition & {
  pattern: RegExp;
};

export type SettingsAuditContext = {
  requestId: string;
  actor: string;
};

type RequestWithAuditContext = express.Request & {
  settingsAuditContext?: SettingsAuditContext;
};

const SETTINGS_PROTECTED_ROUTE_DEFINITIONS: ProtectedRouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/config/export',
    examplePath: '/api/config/export',
  },
  {
    method: 'GET',
    path: '/api/config/all',
    examplePath: '/api/config/all',
  },
  {
    method: 'POST',
    path: '/api/config/apikey',
    examplePath: '/api/config/apikey',
  },
  {
    method: 'PATCH',
    path: '/api/config/ui',
    examplePath: '/api/config/ui',
  },
  {
    method: 'PATCH',
    path: '/api/config/provider/:providerId',
    examplePath: '/api/config/provider/siliconflow',
  },
  {
    method: 'GET',
    path: '/api/config/provider/:providerId/models',
    examplePath: '/api/config/provider/siliconflow/models',
  },
  {
    method: 'POST',
    path: '/api/config/provider/:providerId/test',
    examplePath: '/api/config/provider/siliconflow/test',
  },
  {
    method: 'POST',
    path: '/api/config/provider/:providerId/key-token',
    examplePath: '/api/config/provider/siliconflow/key-token',
  },
  {
    method: 'POST',
    path: '/api/config/provider/:providerId/key-reveal',
    examplePath: '/api/config/provider/siliconflow/key-reveal',
  },
  {
    method: 'PATCH',
    path: '/api/config/storage',
    examplePath: '/api/config/storage',
  },
  {
    method: 'POST',
    path: '/api/config/save-all',
    examplePath: '/api/config/save-all',
  },
  {
    method: 'POST',
    path: '/api/config/import',
    examplePath: '/api/config/import',
  },
  {
    method: 'POST',
    path: '/api/config/reset-default',
    examplePath: '/api/config/reset-default',
  },
  {
    method: 'POST',
    path: '/api/storage/open',
    examplePath: '/api/storage/open',
  },
  {
    method: 'POST',
    path: '/api/storage/docs/open',
    examplePath: '/api/storage/docs/open',
  },
  {
    method: 'POST',
    path: '/api/storage/cache/clear',
    examplePath: '/api/storage/cache/clear',
  },
];

export const SETTINGS_PROTECTED_ROUTE_MATRIX: ProtectedRoute[] = SETTINGS_PROTECTED_ROUTE_DEFINITIONS.map((route) => ({
  ...route,
  pattern: compileRoutePattern(route.path),
}));

type AuthOptions = {
  sessionToken?: string;
  csrfToken?: string;
  actor?: string;
};

export function createSettingsSecurityMiddleware(options: AuthOptions = {}): express.RequestHandler {
  const sessionToken = options.sessionToken ?? resolveTokenFromEnv('SETTINGS_SESSION_TOKEN', DEV_SESSION_SECRET);
  const csrfToken = options.csrfToken ?? resolveTokenFromEnv('SETTINGS_CSRF_TOKEN', DEV_CSRF_SECRET);
  const actor = options.actor ?? LOCAL_ACTOR;

  return (req, res, next) => {
    if (!isProtectedSettingsMutation(req.method, req.path)) {
      next();
      return;
    }

    if (!isValidToken(readHeaderToken(req, SETTINGS_SESSION_HEADER), sessionToken)) {
      res.status(401).json({ code: 'AUTH_UNAUTHORIZED', message: 'session token is required' });
      return;
    }

    if (!isValidToken(readHeaderToken(req, SETTINGS_CSRF_HEADER), csrfToken)) {
      res.status(403).json({ code: 'CSRF_INVALID', message: 'csrf token is required' });
      return;
    }

    const requestId = readHeaderToken(req, SETTINGS_REQUEST_ID_HEADER) || crypto.randomUUID();
    const audit: SettingsAuditContext = {
      requestId,
      actor,
    };
    (req as RequestWithAuditContext).settingsAuditContext = audit;
    res.setHeader(SETTINGS_REQUEST_ID_HEADER, requestId);
    next();
  };
}

export function createSettingsAuditContext(req: express.Request): SettingsAuditContext {
  const fromRequest = (req as RequestWithAuditContext).settingsAuditContext;
  if (fromRequest) {
    return fromRequest;
  }

  return {
    requestId: readHeaderToken(req, SETTINGS_REQUEST_ID_HEADER) || crypto.randomUUID(),
    actor: LOCAL_ACTOR,
  };
}

export function isProtectedSettingsMutation(method: string, path: string) {
  const normalizedMethod = method.toUpperCase();
  return SETTINGS_PROTECTED_ROUTE_MATRIX.some((route) => route.method === normalizedMethod && route.pattern.test(path));
}

export function getSettingsAuthBootstrapTokens() {
  if (isProductionEnv) {
    return null;
  }

  return {
    sessionToken: resolveTokenFromEnv('SETTINGS_SESSION_TOKEN', DEV_SESSION_SECRET),
    csrfToken: resolveTokenFromEnv('SETTINGS_CSRF_TOKEN', DEV_CSRF_SECRET),
  };
}

function readHeaderToken(req: express.Request, headerName: string): string {
  const raw = req.header(headerName);
  return typeof raw === 'string' ? raw.trim() : '';
}

function isValidToken(provided: string, expected: string) {
  if (!provided || !expected) {
    return false;
  }

  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function resolveTokenFromEnv(envKey: 'SETTINGS_SESSION_TOKEN' | 'SETTINGS_CSRF_TOKEN', devFallback: string) {
  const fromEnv = process.env[envKey];
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim();
  }

  if (isProductionEnv) {
    throw new Error(`${envKey} is required in production`);
  }

  return devFallback;
}

function compileRoutePattern(pathTemplate: string) {
  const escaped = pathTemplate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const paramPattern = escaped.replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${paramPattern}$`);
}
