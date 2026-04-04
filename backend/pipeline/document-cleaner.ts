import type { ParsedDocument } from './document-parser.ts';

type CleanedDocument = {
  fileType: string;
  fileName: string;
  text: string;
  cleaningApplied: string[];
  structure: Array<{ label: string; level: number }>;
};

function removeMojibake(input: string) {
  return input.replace(/æµè¯/g, '');
}

function collapseBlankLines(input: string) {
  return input.replace(/\n{3,}/g, '\n\n');
}

function removePaginationFooters(input: string) {
  return input.replace(/^页码\s*\d+$/gm, '').trim();
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

  const structure = parsed.units
    .filter((unit) => unit.sourceUnit === 'heading' && unit.text.trim())
    .map((unit) => ({ label: unit.text.trim(), level: 1 }));

  return {
    fileType: parsed.fileType,
    fileName: parsed.fileName,
    text: text.trim(),
    cleaningApplied,
    structure,
  };
}

export type { CleanedDocument };
