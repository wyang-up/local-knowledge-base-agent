import type { CleanedDocument } from './document-cleaner.ts';
import { splitSentencesByBoundary } from './document-sentence-splitter.ts';

type ChunkDraft = {
  sourceUnit: 'body' | 'heading' | 'sheet' | 'json_node';
  sourceLabel: string | null;
  content: string;
  tokenCount: number;
  overlapTokenCount: number;
  qualityStatus: 'passed' | 'merged' | 'split' | 'filtered';
  qualityNote?: string | null;
  retrievalEligible?: boolean;
  sectionLevel?: 1 | 2 | 3;
  sectionType?: 'abstract' | 'preface' | 'toc' | 'appendix' | 'references' | 'ack' | 'body';
};

type Section = {
  heading: string;
  level: 1 | 2 | 3;
  type: ChunkDraft['sectionType'];
  lines: string[];
};

const SENTENCE_REGEX = /[^。！？；.!?;\n]+[。！？；.!?;]?/g;
const SMALL_DOC_TOKEN_THRESHOLD = 900;
const MIN_FRAGMENT_TOKEN = 100;
const OVERSIZE_TOKEN_THRESHOLD = 1200;

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 2));
}

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
  return splitSentencesByBoundary(paragraph);
}

function tailOverlap(parts: string[], targetToken: number) {
  const selected: string[] = [];
  let count = 0;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const sentence = parts[index]!;
    const tokens = estimateTokens(sentence);
    if (count + tokens > targetToken && selected.length > 0) break;
    selected.unshift(sentence);
    count += tokens;
    if (count >= targetToken) break;
  }
  return { selected, count };
}

function headingPrefix(level: 1 | 2 | 3, heading: string) {
  const mark = level === 1 ? '#' : level === 2 ? '##' : '###';
  return `${mark} ${heading}`;
}

function detectHeadingLevel(text: string): 1 | 2 | 3 | null {
  const value = normalizeText(text);
  if (!value) return null;

  if (/^(chapter\s+\d+|第[一二三四五六七八九十百千\d]+章|摘要|前言|目录|附录|参考文献|致谢|abstract|introduction|toc|appendix|references|acknowledg(e)?ment)$/i.test(value)) {
    return 1;
  }
  if (/^(section\s+\d+|第[一二三四五六七八九十百千\d]+节|\d+\.\d+\s+.+|[一二三四五六七八九十]+、.+|heading\s*2)$/i.test(value)) {
    return 2;
  }
  if (/^(\d+\.\d+\.\d+\s+.+|[（(][一二三四五六七八九十\d]+[)）].+|heading\s*3)$/i.test(value)) {
    return 3;
  }
  if (/^[A-Z][A-Z\s\d:-]{3,}$/.test(value)) return 1;
  return null;
}

function detectSectionType(heading: string): ChunkDraft['sectionType'] {
  const text = normalizeText(heading).toLowerCase();
  if (/^(摘要|abstract)$/.test(text)) return 'abstract';
  if (/^(前言|introduction)$/.test(text)) return 'preface';
  if (/^(目录|toc)$/.test(text)) return 'toc';
  if (/^(附录|appendix)$/.test(text)) return 'appendix';
  if (/^(参考文献|references?)$/.test(text)) return 'references';
  if (/^(致谢|acknowledgment|acknowledgement)$/.test(text)) return 'ack';
  return 'body';
}

function toSections(cleaned: CleanedDocument) {
  const lines = cleaned.text
    .split(/\n\s*\n+/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .flatMap((paragraph) => paragraph.split('\n').map((line) => line.trim()).filter(Boolean));

  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const level = detectHeadingLevel(line);
    if (level) {
      current = {
        heading: line,
        level,
        type: detectSectionType(line),
        lines: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = {
        heading: '正文',
        level: 1,
        type: 'body',
        lines: [],
      };
      sections.push(current);
    }
    current.lines.push(line);
  }

  return sections;
}

function chunkSectionBySentences(input: {
  section: Section;
  minToken: number;
  maxToken: number;
  overlapToken: number;
  qualityNote: string;
  retrievalEligible: boolean;
}): ChunkDraft[] {
  const bodyText = input.section.lines.join(' ');
  const headingLine = headingPrefix(input.section.level, input.section.heading);
  const sentences = splitBySentences(bodyText);
  if (sentences.length === 0) {
    return [{
      sourceUnit: 'body',
      sourceLabel: input.section.heading,
      content: headingLine,
      tokenCount: estimateTokens(headingLine),
      overlapTokenCount: 0,
      qualityStatus: 'passed',
      qualityNote: input.qualityNote,
      retrievalEligible: input.retrievalEligible,
      sectionLevel: input.section.level,
      sectionType: input.section.type,
    }];
  }

  const chunks: ChunkDraft[] = [];
  let parts: string[] = [];
  let tokenCount = 0;
  let overlapFromPrevious = 0;
  let firstChunk = true;

  const flush = (qualityStatus: ChunkDraft['qualityStatus']) => {
    if (parts.length === 0) return;
    const joined = parts.join(' ').trim();
    const content = firstChunk ? `${headingLine}\n\n${joined}` : joined;
    chunks.push({
      sourceUnit: 'body',
      sourceLabel: input.section.heading,
      content,
      tokenCount: estimateTokens(content),
      overlapTokenCount: overlapFromPrevious,
      qualityStatus,
      qualityNote: input.qualityNote,
      retrievalEligible: input.retrievalEligible,
      sectionLevel: input.section.level,
      sectionType: input.section.type,
    });
    firstChunk = false;
    overlapFromPrevious = 0;
  };

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    if (tokenCount + sentenceTokens > input.maxToken && tokenCount >= input.minToken) {
      const previousParts = [...parts];
      flush('split');
      const overlap = input.overlapToken > 0 ? tailOverlap(previousParts, input.overlapToken) : { selected: [], count: 0 };
      parts = [...overlap.selected, sentence];
      tokenCount = overlap.count + sentenceTokens;
      overlapFromPrevious = overlap.count;
      continue;
    }
    parts.push(sentence);
    tokenCount += sentenceTokens;
  }

  flush('passed');
  return chunks;
}

function chunkPdfDocx(cleaned: CleanedDocument): ChunkDraft[] {
  const totalTokens = estimateTokens(cleaned.text);
  if (totalTokens <= SMALL_DOC_TOKEN_THRESHOLD) {
    return [{
      sourceUnit: 'body',
      sourceLabel: cleaned.structure[0]?.label ?? null,
      content: cleaned.text,
      tokenCount: totalTokens,
      overlapTokenCount: 0,
      qualityStatus: 'passed',
      qualityNote: 'small_document_single_chunk',
      retrievalEligible: true,
      sectionLevel: 1,
      sectionType: 'body',
    }];
  }

  const sections = toSections(cleaned);
  const chunks: ChunkDraft[] = [];

  for (const section of sections) {
    if (section.type === 'abstract' || section.type === 'preface' || section.type === 'ack') {
      const headingLine = headingPrefix(1, section.heading);
      const body = section.lines.join(' ').trim();
      const content = body ? `${headingLine}\n\n${body}` : headingLine;
      chunks.push({
        sourceUnit: 'body',
        sourceLabel: section.heading,
        content,
        tokenCount: estimateTokens(content),
        overlapTokenCount: 0,
        qualityStatus: 'passed',
        qualityNote: 'front_back_section_single_chunk',
        retrievalEligible: true,
        sectionLevel: 1,
        sectionType: section.type,
      });
      continue;
    }

    if (section.type === 'toc') {
      const headingLine = headingPrefix(1, section.heading);
      const body = section.lines.join('\n').trim();
      const content = body ? `${headingLine}\n\n${body}` : headingLine;
      chunks.push({
        sourceUnit: 'body',
        sourceLabel: section.heading,
        content,
        tokenCount: estimateTokens(content),
        overlapTokenCount: 0,
        qualityStatus: 'passed',
        qualityNote: 'toc_keep_no_rag',
        retrievalEligible: false,
        sectionLevel: 1,
        sectionType: 'toc',
      });
      continue;
    }

    if (section.type === 'appendix' || section.type === 'references') {
      chunks.push(...chunkSectionBySentences({
        section: { ...section, level: 1 },
        minToken: 600,
        maxToken: 800,
        overlapToken: 40,
        qualityNote: 'appendix_references_semantic_chunk',
        retrievalEligible: true,
      }));
      continue;
    }

    const boundaryOverlap = section.level === 1 ? 40 : 100;
    chunks.push(...chunkSectionBySentences({
      section,
      minToken: 600,
      maxToken: 800,
      overlapToken: boundaryOverlap,
      qualityNote: 'semantic_chunk_pdf_docx',
      retrievalEligible: true,
    }));
  }

  return chunks;
}

function chunkTxt(cleaned: CleanedDocument): ChunkDraft[] {
  const totalTokens = estimateTokens(cleaned.text);
  if (totalTokens <= SMALL_DOC_TOKEN_THRESHOLD) {
    return [{
      sourceUnit: 'body',
      sourceLabel: null,
      content: cleaned.text,
      tokenCount: totalTokens,
      overlapTokenCount: 0,
      qualityStatus: 'passed',
      qualityNote: 'small_text_single_chunk',
      retrievalEligible: true,
      sectionType: 'body',
    }];
  }

  return chunkSectionBySentences({
    section: { heading: '正文', level: 1, type: 'body', lines: splitBySentences(cleaned.text) },
    minToken: 500,
    maxToken: 900,
    overlapToken: 80,
    qualityNote: 'semantic_chunk_txt',
    retrievalEligible: true,
  });
}

function chunkSheets(cleaned: CleanedDocument): ChunkDraft[] {
  const sheetUnits = cleaned.units.filter((unit) => unit.sourceUnit === 'sheet');
  if (sheetUnits.length === 0) {
    return [{
      sourceUnit: 'sheet',
      sourceLabel: 'sheet',
      content: cleaned.text,
      tokenCount: estimateTokens(cleaned.text),
      overlapTokenCount: 0,
      qualityStatus: 'passed',
      qualityNote: 'sheet_fallback',
      retrievalEligible: true,
      sectionType: 'body',
    }];
  }

  const drafts: ChunkDraft[] = [];
  for (const sheet of sheetUnits) {
    const header = (sheet.headers ?? []).join(' | ');
    const rows = sheet.text.split('\n').map((line) => line.trim()).filter(Boolean);
    const prefix = [`Sheet: ${sheet.sourceLabel ?? 'Sheet'}`, header ? `Header: ${header}` : ''].filter(Boolean).join('\n');
    const totalText = `${prefix}\n${rows.join('\n')}`.trim();

    if (estimateTokens(totalText) <= SMALL_DOC_TOKEN_THRESHOLD) {
      drafts.push({
        sourceUnit: 'sheet',
        sourceLabel: sheet.sourceLabel,
        content: totalText,
        tokenCount: estimateTokens(totalText),
        overlapTokenCount: 0,
        qualityStatus: 'passed',
        qualityNote: 'small_sheet_single_chunk',
        retrievalEligible: true,
        sectionType: 'body',
      });
      continue;
    }

    let currentRows: string[] = [];
    let currentTokens = estimateTokens(prefix);
    let overlapRows: string[] = [];
    const flush = (qualityStatus: ChunkDraft['qualityStatus']) => {
      if (currentRows.length === 0) return;
      const content = `${prefix}\n${currentRows.join('\n')}`.trim();
      drafts.push({
        sourceUnit: 'sheet',
        sourceLabel: sheet.sourceLabel,
        content,
        tokenCount: estimateTokens(content),
        overlapTokenCount: estimateTokens(overlapRows.join('\n')),
        qualityStatus,
        qualityNote: 'sheet_semantic_rows',
        retrievalEligible: true,
        sectionType: 'body',
      });
    };

    for (const row of rows) {
      const rowTokens = estimateTokens(row);
      if (currentTokens + rowTokens > 900 && currentRows.length > 0) {
        flush('split');
        const tail = tailOverlap(currentRows, 40);
        overlapRows = tail.selected;
        currentRows = [...overlapRows, row];
        currentTokens = estimateTokens(prefix) + tail.count + rowTokens;
        continue;
      }
      currentRows.push(row);
      currentTokens += rowTokens;
    }

    flush('passed');
  }

  return drafts;
}

function chunkJson(cleaned: CleanedDocument): ChunkDraft[] {
  const totalTokens = estimateTokens(cleaned.text);
  if (totalTokens <= SMALL_DOC_TOKEN_THRESHOLD) {
    return [{
      sourceUnit: 'json_node',
      sourceLabel: 'root',
      content: cleaned.text,
      tokenCount: totalTokens,
      overlapTokenCount: 0,
      qualityStatus: 'passed',
      qualityNote: 'small_json_single_chunk',
      retrievalEligible: true,
      sectionType: 'body',
    }];
  }

  const nodes = cleaned.units.filter((unit) => unit.sourceUnit === 'json_node');
  if (nodes.length === 0) {
    return [{
      sourceUnit: 'json_node',
      sourceLabel: 'root',
      content: cleaned.text,
      tokenCount: totalTokens,
      overlapTokenCount: 0,
      qualityStatus: 'passed',
      qualityNote: 'json_fallback_root',
      retrievalEligible: true,
      sectionType: 'body',
    }];
  }

  const drafts: ChunkDraft[] = [];
  let entries: string[] = [];
  let tokenCount = 0;
  let firstLabel: string | null = null;
  let lastLabel: string | null = null;

  const flush = () => {
    if (entries.length === 0) return;
    const content = `{\n${entries.join(',\n')}\n}`;
    drafts.push({
      sourceUnit: 'json_node',
      sourceLabel: firstLabel && lastLabel ? `${firstLabel}~${lastLabel}` : (firstLabel ?? 'root'),
      content,
      tokenCount: estimateTokens(content),
      overlapTokenCount: 0,
      qualityStatus: 'passed',
      qualityNote: 'json_top_level_group',
      retrievalEligible: true,
      sectionType: 'body',
    });
    entries = [];
    tokenCount = 0;
    firstLabel = null;
    lastLabel = null;
  };

  for (const node of nodes) {
    const label = node.sourceLabel ?? node.nodePath ?? 'node';
    const entry = `"${label}": ${node.text}`;
    const entryTokens = estimateTokens(entry);
    if (tokenCount + entryTokens > 1200 && entries.length > 0) {
      flush();
    }
    if (!firstLabel) firstLabel = label;
    lastLabel = label;
    entries.push(entry);
    tokenCount += entryTokens;
  }
  flush();

  return drafts;
}

function mergeSmallChunks(chunks: ChunkDraft[]) {
  const result: ChunkDraft[] = [];
  for (const chunk of chunks) {
    if (chunk.tokenCount < MIN_FRAGMENT_TOKEN && result.length > 0) {
      const last = result[result.length - 1]!;
      last.content = `${last.content}\n${chunk.content}`.trim();
      last.tokenCount = estimateTokens(last.content);
      last.qualityStatus = 'merged';
      last.qualityNote = 'merge_small_fragments';
      continue;
    }
    result.push({ ...chunk });
  }
  return result;
}

function splitOversizedChunks(chunks: ChunkDraft[]) {
  const result: ChunkDraft[] = [];
  for (const chunk of chunks) {
    if (chunk.tokenCount <= OVERSIZE_TOKEN_THRESHOLD) {
      result.push(chunk);
      continue;
    }

    const separators = chunk.sourceUnit === 'sheet' ? chunk.content.split('\n') : splitBySentences(chunk.content);
    let parts: string[] = [];
    let count = 0;
    const flush = () => {
      if (parts.length === 0) return;
      const content = parts.join(chunk.sourceUnit === 'sheet' ? '\n' : ' ').trim();
      result.push({
        ...chunk,
        content,
        tokenCount: estimateTokens(content),
        qualityStatus: 'split',
        qualityNote: 'split_oversized_chunk',
      });
      parts = [];
      count = 0;
    };

    for (const item of separators) {
      const normalized = item.trim();
      if (!normalized) continue;
      const tokens = estimateTokens(normalized);
      if (count + tokens > 1000 && parts.length > 0) {
        flush();
      }
      parts.push(normalized);
      count += tokens;
    }
    flush();
  }
  return result;
}

function filterInvalidChunks(chunks: ChunkDraft[]) {
  return chunks
    .map((chunk) => ({ ...chunk, content: chunk.content.trim(), tokenCount: estimateTokens(chunk.content.trim()) }))
    .filter((chunk) => chunk.content.length > 0);
}

export function chunkDocument(cleaned: CleanedDocument): ChunkDraft[] {
  const fileType = cleaned.fileType.replace(/^\./, '').toLowerCase();

  if (fileType === 'pdf' || fileType === 'docx') return chunkPdfDocx(cleaned);
  if (fileType === 'txt') return chunkTxt(cleaned);
  if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'csv') return chunkSheets(cleaned);
  if (fileType === 'json') return chunkJson(cleaned);

  return [{
    sourceUnit: 'body',
    sourceLabel: null,
    content: cleaned.text,
    tokenCount: estimateTokens(cleaned.text),
    overlapTokenCount: 0,
    qualityStatus: 'passed',
    retrievalEligible: true,
    sectionType: 'body',
  }];
}

export function qualityCheckChunks(chunks: ChunkDraft[]): ChunkDraft[] {
  const merged = mergeSmallChunks(chunks);
  const split = splitOversizedChunks(merged);
  return filterInvalidChunks(split);
}

export type { ChunkDraft };
