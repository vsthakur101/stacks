/**
 * Languages offered by the language filter. `code` is the MARC/ISO 639-2 code Open Library uses and the
 * URL value (?lang=hin). archive.org stores the same language under several spellings (`hin` on ~741K
 * texts, `Hindi` on ~676K, measured 2026-11-13), so each entry lists every term worth matching there.
 * archive.org's language search is case-insensitive.
 */
export interface Language {
  code: string;
  name: string;
  /** The language's name for itself; shown first in the picker. */
  endonym: string;
  archiveTerms: readonly string[];
  /** Shown as a pill; the rest sit under "More languages". */
  primary?: boolean;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'eng', name: 'English', endonym: 'English', archiveTerms: ['eng', 'English'], primary: true },
  { code: 'hin', name: 'Hindi', endonym: 'हिन्दी', archiveTerms: ['hin', 'Hindi'], primary: true },
  { code: 'san', name: 'Sanskrit', endonym: 'संस्कृतम्', archiveTerms: ['san', 'Sanskrit'], primary: true },
  { code: 'mar', name: 'Marathi', endonym: 'मराठी', archiveTerms: ['mar', 'Marathi'], primary: true },
  { code: 'ben', name: 'Bengali', endonym: 'বাংলা', archiveTerms: ['ben', 'Bengali', 'Bangla'] },
  { code: 'guj', name: 'Gujarati', endonym: 'ગુજરાતી', archiveTerms: ['guj', 'Gujarati'] },
  { code: 'pan', name: 'Punjabi', endonym: 'ਪੰਜਾਬੀ', archiveTerms: ['pan', 'Punjabi', 'Panjabi'] },
  { code: 'urd', name: 'Urdu', endonym: 'اردو', archiveTerms: ['urd', 'Urdu'] },
  { code: 'nep', name: 'Nepali', endonym: 'नेपाली', archiveTerms: ['nep', 'Nepali'] },
  { code: 'kok', name: 'Konkani', endonym: 'कोंकणी', archiveTerms: ['kok', 'Konkani'] },
  { code: 'ori', name: 'Odia', endonym: 'ଓଡ଼ିଆ', archiveTerms: ['ori', 'Oriya', 'Odia'] },
  { code: 'tam', name: 'Tamil', endonym: 'தமிழ்', archiveTerms: ['tam', 'Tamil'] },
  { code: 'tel', name: 'Telugu', endonym: 'తెలుగు', archiveTerms: ['tel', 'Telugu'] },
  { code: 'kan', name: 'Kannada', endonym: 'ಕನ್ನಡ', archiveTerms: ['kan', 'Kannada'] },
  { code: 'mal', name: 'Malayalam', endonym: 'മലയാളം', archiveTerms: ['mal', 'Malayalam'] },
];

export function findLanguage(code: string | undefined): Language | undefined {
  return code ? LANGUAGES.find((l) => l.code === code) : undefined;
}
