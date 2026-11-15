/**
 * Devanagari → SLP1, the one-letter-per-sound Roman scheme Sanskrit tools use (INRIA's Sanskrit
 * Heritage accepts it, not Devanagari). Unknown characters are dropped.
 */

const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'K', ग: 'g', घ: 'G', ङ: 'N', च: 'c', छ: 'C', ज: 'j', झ: 'J', ञ: 'Y', ट: 'w', ठ: 'W', ड: 'q', ढ: 'Q',
  ण: 'R', त: 't', थ: 'T', द: 'd', ध: 'D', न: 'n', प: 'p', फ: 'P', ब: 'b', भ: 'B', म: 'm', य: 'y', र: 'r', ल: 'l',
  ळ: 'L', व: 'v', श: 'S', ष: 'z', स: 's', ह: 'h',
};
const VOWELS: Record<string, string> = { अ: 'a', आ: 'A', इ: 'i', ई: 'I', उ: 'u', ऊ: 'U', ऋ: 'f', ॠ: 'F', ऌ: 'x', ॡ: 'X', ए: 'e', ऐ: 'E', ओ: 'o', औ: 'O' };
const SIGNS: Record<string, string> = { 'ा': 'A', 'ि': 'i', 'ी': 'I', 'ु': 'u', 'ू': 'U', 'ृ': 'f', 'ॄ': 'F', 'ॢ': 'x', 'ॣ': 'X', 'े': 'e', 'ै': 'E', 'ो': 'o', 'ौ': 'O' };
const MARKS: Record<string, string> = { 'ं': 'M', 'ः': 'H', 'ँ': '~', 'ऽ': "'" };
const VIRAMA = '्';

export function devanagariToSlp1(word: string): string {
  const chars = [...word.normalize('NFC').replace(/़/g, '')];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const next = chars[i + 1];
    if (CONSONANTS[c]) {
      out += CONSONANTS[c];
      if (next === VIRAMA) i++;
      else if (!(next && SIGNS[next])) out += 'a'; // inherent vowel
    } else if (SIGNS[c]) out += SIGNS[c];
    else if (VOWELS[c]) out += VOWELS[c];
    else if (MARKS[c]) out += MARKS[c];
  }
  return out;
}
