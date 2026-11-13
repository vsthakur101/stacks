/** The three looks; chosen in Settings, stored in a cookie so the server renders the right one. */
export const THEMES = [
  { id: 'catalogue', name: 'Catalogue', blurb: 'A modern museum catalogue: white, crisp, one ultramarine accent.' },
  { id: 'reading', name: 'Reading', blurb: 'Soft and app-like: grey and white panels, rounded covers.' },
  { id: 'poster', name: 'Poster', blurb: 'Bold: every section has its own colour and big headlines.' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export const DEFAULT_THEME: ThemeId = 'catalogue';
export const THEME_COOKIE = 'stacks-theme';

export function parseTheme(value: string | undefined): ThemeId {
  return THEMES.some((t) => t.id === value) ? (value as ThemeId) : DEFAULT_THEME;
}
