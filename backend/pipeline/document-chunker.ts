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
  sectionType?: 'abstract' | 'preface' | 'intro' | 'toc' | 'appendix' | 'references' | 'ack' | 'chapter' | 'body';
  lang?: 'zh' | 'en';
  title?: string;
  hierarchy?: string[];
  nodeType?: 'abstract' | 'preface' | 'intro' | 'toc' | 'appendix' | 'ref' | 'ack' | 'chapter' | 'body';
  pageStart?: number | null;
  pageEnd?: number | null;
};

type Section = {
  heading: string;
  level: 1 | 2 | 3;
  type: ChunkDraft['sectionType'];
  hierarchy: string[];
  lines: string[];
};

const SENTENCE_REGEX = /[^。！？；.!?;\n]+[。！？；.!?;]?/g;
const SMALL_DOC_TOKEN_THRESHOLD = 900;
const MIN_FRAGMENT_TOKEN = 100;
const OVERSIZE_TOKEN_THRESHOLD = 1200;

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 2));
}

function detectPrimaryLanguage(text: string): 'zh' | 'en' {
  const normalized = normalizeText(text);
  const zhCount = (normalized.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const enCount = (normalized.match(/[A-Za-z]/g) ?? []).length;
  if (zhCount === 0 && enCount === 0) return 'zh';
  return zhCount >= enCount ? 'zh' : 'en';
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

function normalizeText(text: string) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

function splitBySentences(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return [] as string[];
  const byBoundary = splitSentencesByBoundary(normalized);
  if (byBoundary.length > 0) {
    return byBoundary.map((item) => item.trim()).filter(Boolean);
  }
  const hits = normalized.match(SENTENCE_REGEX);
  return (hits ?? [normalized]).map((item) => item.trim()).filter(Boolean);
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

  if (/^(chapter\s+\d+|第[一二三四五六七八九十百千\d]+章|摘要|前言|引言|目录|附录|参考文献|致谢|abstract|introduction|toc|appendix|references|acknowledg(e)?ment)$/i.test(value)) {
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
  if (/^(引言|intro|introduction)$/.test(text)) return 'intro';
  if (/^(目录|toc)$/.test(text)) return 'toc';
  if (/^(附录|appendix)$/.test(text)) return 'appendix';
  if (/^(参考文献|references?)$/.test(text)) return 'references';
  if (/^(致谢|acknowledgment|acknowledgement)$/.test(text)) return 'ack';
  if (/^(chapter\s+\d+|第[一二三四五六七八九十百千\d]+章)/i.test(text)) return 'chapter';
  return 'body';
}

function toNodeType(sectionType: ChunkDraft['sectionType']): ChunkDraft['nodeType'] {
  switch (sectionType) {
    case 'references':
      return 'ref';
    case 'abstract':
    case 'preface':
    case 'intro':
    case 'toc':
    case 'appendix':
    case 'ack':
    case 'chapter':
      return sectionType;
    default:
      return 'body';
  }
}

function toSections(cleaned: CleanedDocument) {
  const lines = cleaned.text
    .split(/\n\s*\n+/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .flatMap((paragraph) => paragraph.split('\n').map((line) => line.trim()).filter(Boolean));

  const sections: Section[] = [];
  let current: Section | null = null;
  const headingStack: Array<{ level: 1 | 2 | 3; heading: string }> = [];

  for (const line of lines) {
    const level = detectHeadingLevel(line);
    if (level) {
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, heading: line });
      current = {
        heading: line,
        level,
        type: detectSectionType(line),
        hierarchy: headingStack.map((item) => item.heading),
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
        hierarchy: ['正文'],
        lines: [],
      };
      sections.push(current);
    }
    current.lines.push(line);
  }

  return sections;
}

function isReferenceEntryStart(line: string) {
  const value = normalizeWhitespace(line);
  if (!value) return false;
  if (/^(\[\d+\]|\d+[.)]|\(\d+\)|（\d+）|[•*-]\s+)/.test(value)) return true;
  if (/^[A-Z][A-Za-z\-\s.,&]{2,80}\(\d{4}[a-z]?\)/.test(value)) return true;
  return false;
}

function splitReferenceEntries(lines: string[]) {
  const entries: string[] = [];
  let current = '';

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line) continue;

    if (current && isReferenceEntryStart(line)) {
      entries.push(current.trim());
      current = line;
      continue;
    }

    current = current ? `${current} ${line}` : line;
  }

  if (current) entries.push(current.trim());
  if (entries.length > 0) return entries;

  const fallback = normalizeWhitespace(lines.join(' '));
  return fallback ? [fallback] : [];
}

function chunkReferencesByEntries(section: Section, lang: 'zh' | 'en'): ChunkDraft[] {
  const headingLine = headingPrefix(1, section.heading);
  const entries = splitReferenceEntries(section.lines);
  if (entries.length === 0) {
    return [{
      sourceUnit: 'body',
      sourceLabel: section.heading,
      content: headingLine,
      tokenCount: estimateTokens(headingLine),
      overlapTokenCount: 0,
      qualityStatus: 'passed',
      qualityNote: 'references_entry_chunk',
      retrievalEligible: true,
      sectionLevel: 1,
      sectionType: 'references',
      lang,
      title: section.heading,
      hierarchy: section.hierarchy,
      nodeType: 'ref',
      pageStart: null,
      pageEnd: null,
    }];
  }

  return entries.map((entry) => {
    const content = `${headingLine}\n\n${entry}`;
    return {
      sourceUnit: 'body' as const,
      sourceLabel: section.heading,
      content,
      tokenCount: estimateTokens(content),
      overlapTokenCount: 0,
      qualityStatus: 'passed' as const,
      qualityNote: 'references_entry_chunk',
      retrievalEligible: true,
      sectionLevel: 1 as const,
      sectionType: 'references' as const,
      lang,
      title: section.heading,
      hierarchy: section.hierarchy,
      nodeType: 'ref' as const,
      pageStart: null,
      pageEnd: null,
    };
  });
}

function chunkSectionBySentences(input: {
  section: Section;
  minToken: number;
  maxToken: number;
  overlapToken: number;
  qualityNote: string;
  retrievalEligible: boolean;
  lang: 'zh' | 'en';
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
      lang: input.lang,
      title: input.section.heading,
      hierarchy: input.section.hierarchy,
      nodeType: toNodeType(input.section.type),
      pageStart: null,
      pageEnd: null,
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
      lang: input.lang,
      title: input.section.heading,
      hierarchy: input.section.hierarchy,
      nodeType: toNodeType(input.section.type),
      pageStart: null,
      pageEnd: null,
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
  const documentLang = detectPrimaryLanguage(cleaned.text);
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
      lang: documentLang,
      title: cleaned.fileName,
      hierarchy: [cleaned.fileName],
      nodeType: 'body',
      pageStart: null,
      pageEnd: null,
    }];
  }

  const sections = toSections(cleaned);
  const chunks: ChunkDraft[] = [];

  for (const section of sections) {
    if (section.type === 'abstract' || section.type === 'preface' || section.type === 'ack' || section.type === 'appendix') {
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
        qualityNote: section.type === 'appendix' ? 'appendix_single_chunk' : 'front_back_section_single_chunk',
        retrievalEligible: true,
        sectionLevel: 1,
        sectionType: section.type,
        lang: detectPrimaryLanguage(content),
        title: section.heading,
        hierarchy: section.hierarchy,
        nodeType: toNodeType(section.type),
        pageStart: null,
        pageEnd: null,
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
        lang: detectPrimaryLanguage(content),
        title: section.heading,
        hierarchy: section.hierarchy,
        nodeType: 'toc',
        pageStart: null,
        pageEnd: null,
      });
      continue;
    }

    if (section.type === 'references') {
      chunks.push(...chunkReferencesByEntries({ ...section, level: 1 }, detectPrimaryLanguage(section.lines.join(' '))));
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
      lang: detectPrimaryLanguage(section.lines.join(' ')),
    }));
  }

  return chunks;
}

function chunkTxt(cleaned: CleanedDocument): ChunkDraft[] {
  const lang = detectPrimaryLanguage(cleaned.text);
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
      lang,
      title: cleaned.fileName,
      hierarchy: [cleaned.fileName],
      nodeType: 'body',
      pageStart: null,
      pageEnd: null,
    }];
  }

  return chunkSectionBySentences({
    section: { heading: '正文', level: 1, type: 'body', hierarchy: ['正文'], lines: splitBySentences(cleaned.text) },
    minToken: 500,
    maxToken: 900,
    overlapToken: 80,
    qualityNote: 'semantic_chunk_txt',
    retrievalEligible: true,
    lang,
  });
}

function chunkSheets(cleaned: CleanedDocument): ChunkDraft[] {
  const lang = detectPrimaryLanguage(cleaned.text);
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
      lang,
      title: cleaned.fileName,
      hierarchy: [cleaned.fileName],
      nodeType: 'body',
      pageStart: null,
      pageEnd: null,
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
        lang,
        title: sheet.sourceLabel ?? cleaned.fileName,
        hierarchy: [sheet.sourceLabel ?? cleaned.fileName],
        nodeType: 'body',
        pageStart: null,
        pageEnd: null,
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
        lang,
        title: sheet.sourceLabel ?? cleaned.fileName,
        hierarchy: [sheet.sourceLabel ?? cleaned.fileName],
        nodeType: 'body',
        pageStart: null,
        pageEnd: null,
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
  const lang = detectPrimaryLanguage(cleaned.text);
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
      lang,
      title: 'root',
      hierarchy: ['root'],
      nodeType: 'body',
      pageStart: null,
      pageEnd: null,
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
      lang,
      title: 'root',
      hierarchy: ['root'],
      nodeType: 'body',
      pageStart: null,
      pageEnd: null,
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
      lang,
      title: firstLabel ?? 'root',
      hierarchy: [firstLabel ?? 'root'],
      nodeType: 'body',
      pageStart: null,
      pageEnd: null,
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
  const lang = detectPrimaryLanguage(cleaned.text);

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
    lang,
    title: cleaned.fileName,
    hierarchy: [cleaned.fileName],
    nodeType: 'body',
    pageStart: null,
    pageEnd: null,
  }];
}

export function qualityCheckChunks(chunks: ChunkDraft[]): ChunkDraft[] {
  const merged = mergeSmallChunks(chunks);
  const split = splitOversizedChunks(merged);
  return filterInvalidChunks(split);
}

export type { ChunkDraft };
