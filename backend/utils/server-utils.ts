type PdfTextPage = {
  text?: string;
};

type PdfTextResult = {
  pages?: PdfTextPage[];
};

type PlainTextEncoding = 'utf8' | 'gb18030' | 'utf16le' | 'utf16be';

type PlainTextDecodeResult = {
  text: string;
  encoding: PlainTextEncoding;
};

const REPLACEMENT_CHAR = '\uFFFD';
const CJK_CHAR_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF]/;
const SUSPICIOUS_LATIN1_PATTERN = /[\u00C0-\u00FF]/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function hasReplacementChar(input: string) {
  return input.includes(REPLACEMENT_CHAR);
}

function hasCjkChar(input: string) {
  return CJK_CHAR_PATTERN.test(input);
}

function garbleScore(input: string) {
  const replacementCount = (input.match(/\uFFFD/g) ?? []).length;
  const controlCount = (input.match(CONTROL_CHAR_PATTERN) ?? []).length;
  const suspiciousCount = (input.match(SUSPICIOUS_LATIN1_PATTERN) ?? []).length;
  return (replacementCount * 12) + (controlCount * 4) + suspiciousCount;
}

function decodeWithTextDecoder(buffer: Buffer, encoding: PlainTextEncoding) {
  return new TextDecoder(encoding).decode(buffer);
}

export function normalizeUploadedFilename(originalName: string) {
  if (!originalName) return originalName;

  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  if (decoded === originalName) {
    return originalName;
  }

  if (hasReplacementChar(decoded)) {
    return originalName;
  }

  if (!hasCjkChar(originalName) && hasCjkChar(decoded)) {
    return decoded;
  }

  return originalName;
}

export function decodePlainTextBuffer(buffer: Buffer): PlainTextDecodeResult {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString('utf8'), encoding: 'utf8' };
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: decodeWithTextDecoder(buffer.subarray(2), 'utf16le'), encoding: 'utf16le' };
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { text: decodeWithTextDecoder(buffer.subarray(2), 'utf16be'), encoding: 'utf16be' };
  }

  const utf8Text = buffer.toString('utf8');
  const utf8Score = garbleScore(utf8Text);
  if (utf8Score === 0) {
    return { text: utf8Text, encoding: 'utf8' };
  }

  const gbText = decodeWithTextDecoder(buffer, 'gb18030');
  const gbScore = garbleScore(gbText);

  if (gbScore < utf8Score) {
    return { text: gbText, encoding: 'gb18030' };
  }

  return { text: utf8Text, encoding: 'utf8' };
}

export function extractPdfText(result: PdfTextResult) {
  return (result.pages ?? [])
    .map((page) => page.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n');
}
