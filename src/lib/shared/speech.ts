/**
 * Read aloud: a page's text split into short sentences for the browser's speech synthesis (Chrome
 * cuts long utterances off after ~15 s, and short ones let the reader mark what's being read).
 */

import type { Rect } from './annotations';
import { looksLikeRealText } from './annotations';

export interface SpeechItem {
  str: string;
  rect: Rect;
}

export interface SpeechChunk {
  text: string;
  /** Boxes (page fractions) of the items the sentence came from. */
  rects: Rect[];
}

const SENTENCE_END = /[।॥.?!]["'”’)\]]*$/;
const MAX_CHUNK = 220;

/** Splits a page's items into sentences, keeping each sentence's boxes. Unreadable text is dropped. */
export function speechChunks(items: readonly SpeechItem[]): SpeechChunk[] {
  const chunks: SpeechChunk[] = [];
  let text = '';
  let rects: Rect[] = [];
  const flush = () => {
    const t = text
      .replace(/\s+/g, ' ')
      // Page and verse numbers ("( १५३ )", "॥ १२ ॥") and OCR debris are read as noise; dandas stay as pauses.
      .replace(/[([{]\s*[0-9०-९]+\s*[)\]}]?/g, ' ')
      .replace(/[0-9०-९]+\s*(?=॥|$)/g, ' ')
      .replace(/[`'"‘’“”~¶*=|<>^ˆ]+/g, ' ')
      .replace(/(^|\s)[.,;:!]+(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (t && looksLikeRealText(t)) chunks.push({ text: t, rects });
    text = '';
    rects = [];
  };
  for (const item of items) {
    const s = item.str.trim();
    if (!s) continue;
    text += (text ? ' ' : '') + s;
    rects.push(item.rect);
    if (SENTENCE_END.test(s) || text.length >= MAX_CHUNK) flush();
  }
  flush();
  return chunks;
}

/** The script a page is written in decides the voice: Devanagari → Hindi, otherwise English. */
export function speechLanguage(text: string): 'hi' | 'en' {
  const deva = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return deva > latin ? 'hi' : 'en';
}
