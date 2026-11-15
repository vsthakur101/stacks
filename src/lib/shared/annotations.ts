/** Shared between the reader (client) and the annotation store (server). */
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** Translucent fills, multiplied over the scan so the print stays legible in every theme. */
export const COLOR_FILL: Record<HighlightColor, string> = {
  yellow: 'rgb(250 214 60 / 0.42)',
  green: 'rgb(110 210 130 / 0.38)',
  blue: 'rgb(110 170 255 / 0.36)',
  pink: 'rgb(255 140 180 / 0.38)',
};
/** The same hues, opaque: colour dots and the rule beside a captured passage. */
export const COLOR_SOLID: Record<HighlightColor, string> = {
  yellow: 'rgb(232 186 20)',
  green: 'rgb(70 180 100)',
  blue: 'rgb(80 145 240)',
  pink: 'rgb(235 105 150)',
};
export const ANNOTATION_KINDS = ['highlight', 'bookmark', 'note'] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Annotation {
  id: string;
  file: string;
  identifier: string | null;
  page: number;
  kind: AnnotationKind;
  rect: Rect | null;
  color: HighlightColor | null;
  note: string | null;
  text: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Whether text from a PDF's hidden layer looks real (in any Indic script or Latin). Scans with legacy (pre-Unicode) Hindi fonts
 * produce strings of symbols; those aren't worth keeping.
 */
export function looksLikeRealText(text: string): boolean {
  const t = text.replace(/\s+/g, '');
  if (t.length < 2) return false;
  // Any Indic script (Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam), Latin, digits.
  const letters = (t.match(/[\u0900-\u0D7FA-Za-z0-9]/g) ?? []).length;
  return letters / t.length >= 0.7;
}

/**
 * Text items under a box (all in page fractions). An item counts when its horizontal extent overlaps
 * the box and its vertical centre lies inside it, so a box drawn mid-line still catches the line.
 */
export function textInRect(items: { str: string; x: number; y: number; w?: number }[], rect: Rect): string {
  const inside = items.filter((i) => {
    const right = i.x + (i.w ?? 0);
    const overlaps = right >= rect.x && i.x <= rect.x + rect.w;
    return overlaps && i.y >= rect.y - 0.005 && i.y <= rect.y + rect.h + 0.005;
  });
  const text = inside
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    // Rejoin words the typesetter split across lines ("al- ways" → "always").
    .replace(/([a-z])- ([a-z])/g, '$1$2')
    .trim();
  return looksLikeRealText(text) ? text.slice(0, 4000) : '';
}
