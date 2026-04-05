const SENTENCE_SPLIT_REGEX = /[^。！？；.!?;]+[。！？；.!?;]?/g;

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

export function splitSentencesForTest(text: string) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [] as string[];
  const matches = normalized.match(SENTENCE_SPLIT_REGEX);
  return (matches ?? [normalized]).map((segment) => segment.trim()).filter(Boolean);
}
