export function resolveLancePath(configuredPath: string, fallbackPath: string) {
  if (configuredPath.startsWith('/mnt/')) {
    return fallbackPath;
  }
  return configuredPath;
}
