import type { CleanedDocument } from './document-cleaner.ts';

type ChunkDraft = {
  sourceUnit: 'body' | 'heading' | 'sheet' | 'json_node';
  sourceLabel: string | null;
  content: string;
  tokenCount: number;
  qualityStatus: 'passed' | 'merged' | 'split' | 'filtered';
  qualityNote?: string | null;
};

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 2));
}

const SENTENCE_BOUNDARY_REGEX = /(?<=[。！？；.!?;])(?:\s+|$)/;
const HEADING_REGEXES = [
  /^chapter\s+\d+[\w.-]*$/i,
  /^section\s+\d+[\w.-]*$/i,
  /^\d+(?:\.\d+)*[.)]?\s+.+$/,
  /^[A-Z][A-Z\s\d:-]{2,}$/,
  /^第.+[章节部分篇]$/,
];

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

function normalizeComparableLabel(text: string) {
  return normalizeWhitespace(text).replace(/[。！？；.!?;]+$/g, '').trim();
}

function isHeadingCandidate(line: string) {
  const normalized = normalizeWhitespace(line);
  if (!normalized) return false;
  if (normalized.length <= 80 && HEADING_REGEXES.some((regex) => regex.test(normalized))) {
    return true;
  }
  return false;
}

function splitParagraphIntoSentences(paragraph: string) {
  const normalized = normalizeWhitespace(paragraph);
  if (!normalized) return [] as string[];
  const matches = normalized.match(/[^。！？；.!?;]+[。！？；.!?;]?/g);
  return (matches ?? [normalized])
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function splitPdfDocxIntoSegments(text: string) {
  const paragraphs = text
    .replace(/\r/g, '')
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const segments: string[] = [];
  for (const paragraph of paragraphs) {
    const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 1 && isHeadingCandidate(lines[0] ?? '')) {
      segments.push(lines[0]!.trim());
      continue;
    }

    for (const line of lines) {
      if (isHeadingCandidate(line)) {
        segments.push(line);
        continue;
      }
      segments.push(...splitParagraphIntoSentences(line));
    }
  }

  return segments.filter(Boolean);
}

function isKnownStructureHeading(segment: string, structure: CleanedDocument['structure']) {
  const normalized = normalizeComparableLabel(segment);
  return structure.some((item) => normalizeComparableLabel(item.label) === normalized);
}

function shouldMergeShortSegments(segments: string[], fileSizeEstimate: number) {
  if (segments.length === 0) return false;
  const tokenCounts = segments.map((segment) => estimateTokens(segment));
  const averageTokens = tokenCounts.reduce((sum, value) => sum + value, 0) / tokenCounts.length;
  return fileSizeEstimate >= 2_000_000 || segments.length >= 120 || (segments.length >= 60 && averageTokens < 120);
}

function mergeAdjacentShortSegments(segments: string[]) {
  const merged: Array<{ content: string; merged: boolean }> = [];
  let buffer: string[] = [];
  let bufferTokens = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    merged.push({
      content: buffer.join(' ').trim(),
      merged: buffer.length > 1,
    });
    buffer = [];
    bufferTokens = 0;
  };

  for (const segment of segments) {
    const segmentTokens = estimateTokens(segment);
    const nextTokens = bufferTokens + segmentTokens;
    if (buffer.length > 0 && nextTokens > 800) {
      flush();
    }

    buffer.push(segment);
    bufferTokens += segmentTokens;

    if (bufferTokens >= 500) {
      flush();
    }
  }

  flush();
  return merged;
}

function splitOversizedSegment(segment: string) {
  const maxTokens = 1000;
  if (estimateTokens(segment) <= maxTokens) {
    return [{ content: segment, split: false }];
  }

  const sentences = splitParagraphIntoSentences(segment);
  if (sentences.length <= 1) {
    return [{ content: segment, split: false }];
  }

  const parts: Array<{ content: string; split: boolean }> = [];
  let buffer: string[] = [];
  let bufferTokens = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    parts.push({ content: buffer.join(' ').trim(), split: true });
    buffer = [];
    bufferTokens = 0;
  };

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    if (buffer.length > 0 && bufferTokens + sentenceTokens > 900) {
      flush();
    }
    buffer.push(sentence);
    bufferTokens += sentenceTokens;
  }

  flush();
  return parts.length > 0 ? parts : [{ content: segment, split: false }];
}

function ensureSentenceTerminator(segment: string) {
  if (/[。！？；.!?;]$/.test(segment)) {
    return segment;
  }
  return `${segment}.`;
}

export function chunkDocument(cleaned: CleanedDocument): ChunkDraft[] {
  if (cleaned.fileType === 'txt') {
    return [{
      sourceUnit: 'body',
      sourceLabel: null,
      content: cleaned.text,
      tokenCount: estimateTokens(cleaned.text),
      qualityStatus: 'passed',
    }];
  }

  if (cleaned.fileType === 'pdf' || cleaned.fileType === 'docx') {
    const baseSegments = splitPdfDocxIntoSegments(cleaned.text);
    const shouldMerge = shouldMergeShortSegments(baseSegments, cleaned.text.length);
    const candidateSegments = shouldMerge
      ? mergeAdjacentShortSegments(baseSegments).map((segment) => ({ content: segment.content, merged: segment.merged }))
      : baseSegments.map((segment) => ({ content: segment, merged: false }));

    const chunks: ChunkDraft[] = [];
    let currentHeadingLabel = cleaned.structure[0]?.label ?? null;

    candidateSegments.forEach((segment, index) => {
      const normalized = normalizeWhitespace(segment.content);
      if (!normalized) return;

      if (isHeadingCandidate(normalized) || isKnownStructureHeading(normalized, cleaned.structure)) {
        currentHeadingLabel = normalized;
        chunks.push({
          sourceUnit: 'heading',
          sourceLabel: normalized,
          content: ensureSentenceTerminator(normalized),
          tokenCount: estimateTokens(normalized),
          qualityStatus: segment.merged ? 'merged' : 'passed',
          qualityNote: segment.merged ? 'merged_adjacent_short_segments' : 'detected_heading',
        });
        return;
      }

      const parts = splitOversizedSegment(segment.merged ? `${normalized} ${normalized}` : normalized);
      parts.forEach((part) => {
        chunks.push({
          sourceUnit: 'body',
          sourceLabel: currentHeadingLabel,
          content: ensureSentenceTerminator(part.content),
          tokenCount: estimateTokens(part.content),
          qualityStatus: part.split ? 'split' : (segment.merged ? 'merged' : 'passed'),
          qualityNote: part.split ? 'split_oversized_segment' : (segment.merged ? 'merged_adjacent_short_segments' : null),
        });
      });

      if (index === 0 && chunks.length > 0 && chunks[0]?.sourceUnit !== 'heading' && currentHeadingLabel) {
        chunks[0] = {
          ...chunks[0],
          sourceLabel: currentHeadingLabel,
        };
      }
    });

    return chunks;
  }

  return [{
    sourceUnit: 'body',
    sourceLabel: null,
    content: cleaned.text,
    tokenCount: estimateTokens(cleaned.text),
    qualityStatus: 'passed',
  }];
}

export function qualityCheckChunks(chunks: ChunkDraft[]): ChunkDraft[] {
  return chunks.map((chunk) => {
    if (!chunk.content.trim()) {
      return { ...chunk, qualityStatus: 'filtered', tokenCount: 0, qualityNote: 'empty_chunk' };
    }

    return chunk;
  });
}

export type { ChunkDraft };
