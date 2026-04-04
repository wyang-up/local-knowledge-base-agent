export function buildMcpNotification(method: string, params: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    method,
    params,
  };
}

export function buildMcpResult(id: string | number, result: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

export function encodeMcpJsonLine(payload: unknown) {
  return `${JSON.stringify(payload)}\n`;
}
