const SENTENCE_SPLIT_REGEX = /[^。！？；.!?;]+[。！？；.!?;]?/g;
const PROTECTED_DOT_TOKEN = '__EB_DOT__';
const SENTENCE_END_SENTINEL = '__EB_END__';

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

function isUpperCaseLatin(char: string) {
  return /^[A-Z]$/.test(char);
}

function isSentenceEndContext(text: string, dotIndex: number) {
  let index = dotIndex + 1;
  while (index < text.length && /\s/.test(text[index] ?? '')) {
    index += 1;
  }

  const nextChar = text[index];
  if (!nextChar) {
    return true;
  }

  return isUpperCaseLatin(nextChar);
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

export function protectEnglishBoundaries(text: string) {
  const candidates = collectCandidates(text);
  if (candidates.length === 0) {
    return text;
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
      output += PROTECTED_DOT_TOKEN;
    } else {
      output += char;
    }

    if (sentenceEndSentinels.has(index)) {
      output += SENTENCE_END_SENTINEL;
    }
  }

  return output;
}

export function restoreProtectedTokens(text: string) {
  return text
    .replaceAll(PROTECTED_DOT_TOKEN, '.')
    .replaceAll(SENTENCE_END_SENTINEL, '');
}

function splitByLegacyBoundary(text: string) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  const matches = normalized.match(SENTENCE_SPLIT_REGEX);
  return (matches ?? [normalized]).map((segment) => segment.trim()).filter(Boolean);
}

function isEnglishBoundaryProtectionEnabled() {
  return process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION !== '0';
}

export function splitSentencesByBoundary(text: string): string[] {
  if (!isEnglishBoundaryProtectionEnabled()) {
    return splitByLegacyBoundary(text);
  }

  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const protectedText = protectEnglishBoundaries(normalized);
  const matches = protectedText.match(SENTENCE_SPLIT_REGEX);
  const segments = (matches ?? [protectedText]).map((segment) => restoreProtectedTokens(segment).trim()).filter(Boolean);
  return segments;
}
