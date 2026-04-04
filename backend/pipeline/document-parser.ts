import { promises as fs } from 'fs';
import * as xlsx from 'xlsx';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { decodePlainTextBuffer, extractPdfText } from '../utils/server-utils.ts';

export type ParsedDocumentUnit = {
  sourceUnit: 'body' | 'sheet' | 'json_node' | 'heading';
  sourceLabel: string | null;
  text: string;
  headers?: string[];
  nodePath?: string;
};

export type ParsedDocument = {
  fileType: string;
  fileName: string;
  text: string;
  units: ParsedDocumentUnit[];
};

type ParseDocumentInput = {
  filePath: string;
  fileType: string;
  fileName: string;
};

function normalizeFileType(fileType: string) {
  return fileType.replace(/^\./, '').toLowerCase();
}

function createBodyParsed(fileType: string, fileName: string, text: string): ParsedDocument {
  return {
    fileType,
    fileName,
    text,
    units: [
      {
        sourceUnit: 'body',
        sourceLabel: null,
        text,
      },
    ],
  };
}

export async function parseDocument(input: ParseDocumentInput): Promise<ParsedDocument> {
  const fileType = normalizeFileType(input.fileType);

  if (fileType === 'txt') {
    const decoded = decodePlainTextBuffer(await fs.readFile(input.filePath));
    return createBodyParsed(fileType, input.fileName, decoded.text);
  }

  if (fileType === 'json') {
    const raw = await fs.readFile(input.filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const entries = Object.entries(parsed as Record<string, unknown>);
    return {
      fileType,
      fileName: input.fileName,
      text: raw,
      units: entries.map(([key, value]) => ({
        sourceUnit: 'json_node',
        sourceLabel: key,
        nodePath: key,
        text: JSON.stringify(value),
      })),
    };
  }

  if (fileType === 'xlsx' || fileType === 'xls') {
    const workbook = xlsx.readFile(input.filePath);
    const units = workbook.SheetNames.map((sheetName) => {
      const rows = xlsx.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[sheetName], { header: 1 });
      const [headerRow = [], ...dataRows] = rows;
      return {
        sourceUnit: 'sheet' as const,
        sourceLabel: sheetName,
        headers: headerRow.map((cell) => String(cell ?? '')),
        text: dataRows.map((row) => row.map((cell) => String(cell ?? '')).join(' | ')).join('\n'),
      };
    });

    return {
      fileType,
      fileName: input.fileName,
      text: units.map((unit) => unit.text).join('\n'),
      units,
    };
  }

  if (fileType === 'csv') {
    const raw = await fs.readFile(input.filePath, 'utf8');
    const [headerLine = '', ...dataLines] = raw.split(/\r?\n/).filter(Boolean);
    const headers = headerLine.split(',').map((value) => value.trim());
    return {
      fileType,
      fileName: input.fileName,
      text: raw,
      units: [
        {
          sourceUnit: 'sheet',
          sourceLabel: 'CSV',
          headers,
          text: dataLines.join('\n'),
        },
      ],
    };
  }

  if (fileType === 'docx') {
    const result = await mammoth.extractRawText({ path: input.filePath });
    return createBodyParsed(fileType, input.fileName, result.value);
  }

  if (fileType === 'pdf') {
    const parser = new PDFParse({ data: await fs.readFile(input.filePath) });
    const result = await parser.getText();
    await parser.destroy();
    return createBodyParsed(fileType, input.fileName, extractPdfText(result));
  }

  const fallback = await fs.readFile(input.filePath, 'utf8');
  return createBodyParsed(fileType, input.fileName, fallback);
}
