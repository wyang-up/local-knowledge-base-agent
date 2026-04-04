export type McpParsedBuffer = {
  messages: any[];
  rest: string;
};

export function parseMcpJsonLineBuffer(buffer: string): McpParsedBuffer {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const messages: any[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      messages.push(JSON.parse(trimmed));
    } catch {
      // Ignore malformed JSON lines.
    }
  }

  return { messages, rest };
}
