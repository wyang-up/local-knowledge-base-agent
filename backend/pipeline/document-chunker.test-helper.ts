import { splitSentencesByBoundary } from './document-sentence-splitter.ts';

export function splitSentencesForTest(text: string) {
  return splitSentencesByBoundary(text);
}
