import type { ParsedDocument } from './document-parser.ts';

type CleanedDocument = {
  fileType: string;
  fileName: string;
  text: string;
  cleaningApplied: string[];
  structure: Array<{ label: string; level: number }>;
  units: ParsedDocument['units'];
};

function removeMojibake(input: string) {
  return input.replace(/æµè¯/g, '');
}

function removeInvalidSymbols(input: string) {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[□�]{2,}/g, '');
}

function collapseBlankLines(input: string) {
  return input.replace(/\n{3,}/g, '\n\n');
}

function removePaginationFooters(input: string) {
  return input.replace(/^页码\s*\d+$/gm, '').trim();
}

function removeReferenceTail(input: string) {
  const lines = input.replace(/\r/g, '').split('\n');
  const markerIndex = lines.findIndex((line) => /^\s*(参考文献|references?)\s*$/i.test(line.trim()));
  if (markerIndex === -1) return input;
  return lines.slice(0, markerIndex).join('\n').trim();
}

function normalizeBodyText(input: string) {
  return input
    .replace(/^[\s\-—_*#|]+$/gm, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, arr) => line.trim() !== '' || (arr[index - 1]?.trim() ?? '') !== '')
    .join('\n')
    .trim();
}

export function cleanDocumentText(parsed: ParsedDocument): CleanedDocument {
  let text = parsed.text;
  const cleaningApplied: string[] = [];

  const withoutFooter = removePaginationFooters(text);
  if (withoutFooter !== text) {
    text = withoutFooter;
    cleaningApplied.push('remove_pagination_footer');
  }

  const withoutMojibake = removeMojibake(text);
  if (withoutMojibake !== text) {
    text = withoutMojibake;
    cleaningApplied.push('remove_mojibake');
  }

  const collapsed = collapseBlankLines(text);
  if (collapsed !== text) {
    text = collapsed;
    cleaningApplied.push('collapse_blank_lines');
  }

  const withoutInvalidSymbols = removeInvalidSymbols(text);
  if (withoutInvalidSymbols !== text) {
    text = withoutInvalidSymbols;
    cleaningApplied.push('remove_invalid_symbols');
  }

  const withoutReferenceTail = removeReferenceTail(text);
  if (withoutReferenceTail !== text) {
    text = withoutReferenceTail;
    cleaningApplied.push('remove_reference_tail');
  }

  const normalizedBody = normalizeBodyText(text);
  if (normalizedBody !== text) {
    text = normalizedBody;
    cleaningApplied.push('normalize_body_text');
  }

  const structure = parsed.units
    .filter((unit) => unit.sourceUnit === 'heading' && unit.text.trim())
    .map((unit) => ({ label: unit.text.trim(), level: 1 }));

  const units = parsed.units
    .map((unit) => ({
      ...unit,
      text: normalizeBodyText(removeInvalidSymbols(removeMojibake(collapseBlankLines(unit.text)))),
    }))
    .filter((unit) => unit.text.trim().length > 0);

  return {
    fileType: parsed.fileType,
    fileName: parsed.fileName,
    text: text.trim(),
    cleaningApplied,
    structure,
    units,
  };
}

export type { CleanedDocument };
