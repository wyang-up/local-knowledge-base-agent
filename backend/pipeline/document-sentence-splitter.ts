const SENTENCE_SPLIT_REGEX = /[^。！？；.!?;]+[。！？；.!?;]?["'”’）)\]}]*/g;

type CandidateKind = 'numbering' | 'version' | 'abbr_multi' | 'abbr_single';

type Candidate = {
  kind: CandidateKind;
  value: string;
  start: number;
  end: number;
  dotIndexes: number[];
  order: number;
};

const CANDIDATE_PRIORITY: Record<CandidateKind, number> = {
  numbering: 4,
  version: 3,
  abbr_multi: 2,
  abbr_single: 1,
};

type Matcher = {
  kind: CandidateKind;
  regex: RegExp;
};

const MATCHERS: Matcher[] = [
  {
    kind: 'numbering',
    regex: /\b(?:Sec|Eq|No|Fig|pp)\.\s*(?:\(\d+(?:\.\d+)+\)|\d+(?:\.\d+)+(?:[-–]\d+)?|\d+(?:[-–]\d+)?)/gi,
  },
  {
    kind: 'version',
    regex: /(?:\bv)?\d+\.\d+\.\d+(?:\.\d+)*/g,
  },
  {
    kind: 'abbr_multi',
    regex: /\b(?:e\.g|i\.e|U\.S|Ph\.D)\./gi,
  },
  {
    kind: 'abbr_single',
    regex: /\b(?:Dr|Mr|Ms|Sec|Eq|No|Fig|pp)\./gi,
  },
];

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

function isQuoteOrBracket(char: string) {
  return /["'“”‘’(){}\[\]（）]/.test(char);
}

function isUpperCaseLatin(char: string) {
  return /^[A-Z]$/.test(char);
}

function isSentenceEndContext(text: string, dotIndex: number) {
  let index = dotIndex + 1;
  while (index < text.length && (/\s/.test(text[index] ?? '') || isQuoteOrBracket(text[index] ?? ''))) {
    index += 1;
  }

  const nextChar = text[index];
  if (!nextChar) {
    return true;
  }

  return isUpperCaseLatin(nextChar);
}

type ProtectionTokens = {
  protectedDotToken: string;
  sentenceEndToken: string;
};

type ProtectedTextResult = {
  text: string;
  tokens: ProtectionTokens;
};

function buildProtectionTokens(source: string): ProtectionTokens {
  let nonce = 0;
  while (true) {
    const suffix = `${Date.now().toString(36)}_${nonce.toString(36)}`;
    const protectedDotToken = `__EBPD_${suffix}__`;
    const sentenceEndToken = `__EBSE_${suffix}__`;
    if (!source.includes(protectedDotToken) && !source.includes(sentenceEndToken)) {
      return { protectedDotToken, sentenceEndToken };
    }
    nonce += 1;
  }
}

function collectDotIndexes(fullText: string, start: number, end: number) {
  const dots: number[] = [];
  for (let index = start; index < end; index += 1) {
    if (fullText[index] === '.') {
      dots.push(index);
    }
  }
  return dots;
}

function collectCandidates(text: string) {
  const candidates: Candidate[] = [];
  let order = 0;

  for (const matcher of MATCHERS) {
    const regex = new RegExp(matcher.regex.source, matcher.regex.flags);
    let match = regex.exec(text);
    while (match) {
      const value = match[0] ?? '';
      const start = match.index;
      const end = start + value.length;
      const dotIndexes = collectDotIndexes(text, start, end);
      if (dotIndexes.length > 0) {
        candidates.push({
          kind: matcher.kind,
          value,
          start,
          end,
          dotIndexes,
          order,
        });
        order += 1;
      }
      match = regex.exec(text);
    }
  }

  return candidates;
}

function compareCandidates(a: Candidate, b: Candidate) {
  const lengthDiff = (b.end - b.start) - (a.end - a.start);
  if (lengthDiff !== 0) return lengthDiff;

  const priorityDiff = CANDIDATE_PRIORITY[b.kind] - CANDIDATE_PRIORITY[a.kind];
  if (priorityDiff !== 0) return priorityDiff;

  const leftToRightDiff = a.start - b.start;
  if (leftToRightDiff !== 0) return leftToRightDiff;

  return a.order - b.order;
}

function resolveCandidateForDot(dotIndex: number, candidates: Candidate[]) {
  const contenders = candidates.filter((candidate) => candidate.dotIndexes.includes(dotIndex));
  if (contenders.length === 0) {
    return null;
  }
  contenders.sort(compareCandidates);
  return contenders[0] ?? null;
}

function shouldProtectDot(candidate: Candidate, dotIndex: number, fullText: string) {
  const lastDotIndex = candidate.dotIndexes[candidate.dotIndexes.length - 1] ?? dotIndex;
  const isFinalDot = dotIndex === lastDotIndex;

  if (candidate.kind === 'abbr_single') {
    return true;
  }

  if (candidate.kind === 'numbering') {
    return true;
  }

  if (candidate.kind === 'version') {
    if (isFinalDot && isSentenceEndContext(fullText, dotIndex)) {
      return false;
    }
    return true;
  }

  const lowerValue = candidate.value.toLowerCase();
  const isUsOrPhd = lowerValue === 'u.s.' || lowerValue === 'ph.d.';
  if (!isUsOrPhd) {
    return true;
  }

  if (!isFinalDot) {
    return true;
  }

  return !isSentenceEndContext(fullText, dotIndex);
}

function shouldAppendSentenceEndSentinel(candidate: Candidate, dotIndex: number, fullText: string) {
  if (candidate.kind !== 'abbr_multi') {
    return false;
  }

  const lowerValue = candidate.value.toLowerCase();
  const isUsOrPhd = lowerValue === 'u.s.' || lowerValue === 'ph.d.';
  if (!isUsOrPhd) {
    return false;
  }

  const lastDotIndex = candidate.dotIndexes[candidate.dotIndexes.length - 1] ?? dotIndex;
  const isFinalDot = dotIndex === lastDotIndex;
  return isFinalDot && isSentenceEndContext(fullText, dotIndex);
}

export function protectEnglishBoundaries(text: string): ProtectedTextResult {
  const candidates = collectCandidates(text);
  const tokens = buildProtectionTokens(text);
  if (candidates.length === 0) {
    return { text, tokens };
  }

  const protectedDots = new Set<number>();
  const sentenceEndSentinels = new Set<number>();

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '.') {
      continue;
    }

    const winner = resolveCandidateForDot(index, candidates);
    if (!winner) {
      continue;
    }

    if (shouldProtectDot(winner, index, text)) {
      protectedDots.add(index);
      continue;
    }

    if (shouldAppendSentenceEndSentinel(winner, index, text)) {
      sentenceEndSentinels.add(index);
    }
  }

  let output = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (char === '.' && protectedDots.has(index)) {
      output += tokens.protectedDotToken;
    } else {
      output += char;
    }

    if (sentenceEndSentinels.has(index)) {
      output += tokens.sentenceEndToken;
    }
  }

  return { text: output, tokens };
}

export function restoreProtectedTokens(text: string, tokens: ProtectionTokens) {
  return text
    .replaceAll(tokens.protectedDotToken, '.')
    .replaceAll(tokens.sentenceEndToken, '');
}

function splitByLegacyBoundary(text: string) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  const matches = normalized.match(SENTENCE_SPLIT_REGEX);
  return (matches ?? [normalized]).map((segment) => segment.trim()).filter(Boolean);
}

export function isEnglishBoundaryProtectionEnabled() {
  const raw = process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION;
  if (raw === undefined) {
    return true;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off';
}

export function splitSentencesByBoundary(text: string): string[] {
  if (!isEnglishBoundaryProtectionEnabled()) {
    return splitByLegacyBoundary(text);
  }

  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const protectedResult = protectEnglishBoundaries(normalized);
  const matches = protectedResult.text.match(SENTENCE_SPLIT_REGEX);
  const segments = (matches ?? [protectedResult.text])
    .map((segment) => restoreProtectedTokens(segment, protectedResult.tokens).trim())
    .filter(Boolean);
  return segments;
}
