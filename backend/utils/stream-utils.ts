export type OpenAIStreamParseResult = {
  deltas: string[];
  done: boolean;
  rest: string;
};

export function parseOpenAIStreamBuffer(buffer: string): OpenAIStreamParseResult {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const deltas: string[] = [];
  let done = false;

  for (const part of parts) {
    const payload = part
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');

    if (!payload) {
      continue;
    }

    if (payload === '[DONE]') {
      done = true;
      continue;
    }

    try {
      const parsed = JSON.parse(payload);
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        deltas.push(delta);
      }

      const finishReason = parsed?.choices?.[0]?.finish_reason;
      if (typeof finishReason === 'string' && finishReason.length > 0) {
        done = true;
      }
    } catch {
      // Ignore non-JSON chunks from upstream stream.
    }
  }

  return { deltas, done, rest };
}
