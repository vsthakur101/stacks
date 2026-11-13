import { describe, expect, it } from 'vitest';
import type { ItemCard } from '@/lib/shared/types';
import { groupVolumes, idStem, isSafeStem, parseNumber, parseVolume, rangeLabel } from './volumes';

const card = (identifier: string, title: string, volume?: string): ItemCard => ({ identifier, title, volume, isCollection: false, thumbnail: '' });

describe('parseNumber', () => {
  it('reads digits, Devanagari digits, Roman numerals and words', () => {
    expect(['3', '03', 'III', 'iii', 'three', 'third', '३'].map(parseNumber)).toEqual([3, 3, 3, 3, 3, 3, 3]);
    expect(parseNumber('0')).toBeNull();
    expect(parseNumber('hello')).toBeNull();
  });
});

describe('parseVolume', () => {
  it.each([
    ['Siva Purana - English Translation - Part 2 of 4', undefined, 2, 'Siva Purana - English Translation', 4],
    ['Hindi Book Valmiki Ramayan Part II By Gita Press', undefined, 2, 'Hindi Book Valmiki Ramayan By Gita Press', undefined],
    ['The Vishnu Purana: A System Of Hindu Mythology And Tradition. Vol-V', undefined, 5, 'The Vishnu Purana: A System Of Hindu Mythology And Tradition.', undefined],
    ['Bhavishya Purana -Pratisarg Parv -Khand Three', undefined, 3, 'Bhavishya Purana -Pratisarg Parv', undefined],
    ['Valmiki Ramayan Part -4', undefined, 4, 'Valmiki Ramayan', undefined],
    ['महाभारत खण्ड २', undefined, 2, 'महाभारत', undefined],
    ['Mahabharata', '5', 5, 'Mahabharata', undefined],
  ])('%s', (title, volume, n, base, of) => {
    expect(parseVolume(title, volume)).toMatchObject({ n, base, ...(of ? { of } : {}) });
  });

  it('needs real evidence', () => {
    expect(parseVolume('Pride and Prejudice')).toBeNull();
    expect(parseVolume('Byte Magazine Volume 10 Number 02')).toMatchObject({ n: 10 }); // a volume, but…
  });
});

describe('idStem', () => {
  it.each([
    ['SivaPuranaJ.L.ShastriPart2', 2, 'SivaPuranaJ.L.ShastriPart{n}'],
    ['HindiBookValmikiRamayanPartIIByGitaPress', 2, 'HindiBookValmikiRamayanPart{n}ByGitaPress'],
    ['mahabharata04ramauoft', 4, 'mahabharata{n}ramauoft'],
    ['valmiki-ramayan-ii-gita-press-gorakhpur', 2, 'valmiki-ramayan-{n}-gita-press-gorakhpur'],
    ['valmiki-ramayan-part-1-gita-press', 1, 'valmiki-ramayan-part-{n}-gita-press'],
  ])('%s', (id, n, stem) => {
    expect(idStem(id, n)).toBe(stem);
  });

  it("refuses identifiers that don't show the volume (catalogue numbers aren't volumes)", () => {
    expect(idStem('dli.bengal.10689.12977', 1)).toBeNull();
    expect(idStem('in.ernet.dli.2015.327529', 4)).toBeNull();
  });
});

describe('groupVolumes', () => {
  it('groups volumes that share an identifier pattern, at the first volume’s position', () => {
    const cards = [
      card('other', 'Some book'),
      card('SivaPuranaJ.L.ShastriPart3', 'Siva Purana - English Translation - Part 3 of 4'),
      card('SivaPuranaJ.L.ShastriPart1', 'Siva Purana - English Translation - Part 1 of 4'),
      card('mahabharata01ramauoft', 'Mahabharata', '1'),
      card('SivaPuranaJ.L.ShastriPart2', 'Siva Purana - English Translation - Part 2 of 4'),
      card('mahabharata02ramauoft', 'Mahabharata', '2'),
    ];
    const grouped = groupVolumes(cards);
    expect(grouped.map((g) => (g.kind === 'set' ? `set:${g.title}:${g.volumes.map((v) => v.n).join(',')}` : g.card.identifier))).toEqual([
      'other',
      'set:Siva Purana - English Translation:1,2,3',
      'set:Mahabharata:1,2',
    ]);
  });

  it('keeps different editions with the same title apart', () => {
    const grouped = groupVolumes([
      card('valmiki-ramayan-part-1-gita-press', 'Valmiki Ramayan Part 1 Gita Press'),
      card('valmiki-ramayan-part-2-gita-press_202307', 'Valmiki Ramayan Part 2 Gita Press'),
      card('in.ernet.dli.2015.327529', 'Valmiki Ramayan Part -4'),
    ]);
    expect(grouped.every((g) => g.kind === 'item')).toBe(true);
  });

  it('does not make a set out of one volume', () => {
    expect(groupVolumes([card('SivaPuranaJ.L.ShastriPart1', 'Siva Purana Part 1')])[0]!.kind).toBe('item');
  });
});

describe('labels and safety', () => {
  it('writes compact ranges', () => {
    expect(rangeLabel('Part', [1, 2, 3, 4])).toBe('Parts 1–4');
    expect(rangeLabel('Volume', [1, 2, 4, 5, 6])).toBe('Volumes 1, 2, 4–6');
  });

  it('accepts only identifier-like stems', () => {
    expect(isSafeStem('SivaPuranaJ.L.ShastriPart{n}')).toBe(true);
    expect(isSafeStem('a{n}b{n}')).toBe(false);
    expect(isSafeStem('x) OR (y{n}')).toBe(false);
  });
});

describe('idStem edge cases', () => {
  it('does not read a word that starts like a marker as a volume', () => {
    expect(idStem('PartialDifferentialEquations1985', 1)).toBeNull();
  });
});

describe('random upload codes', () => {
  it('treats a leading four-character code as interchangeable when the rest is specific', () => {
    expect(idStem('mWJT_mahabharata-vol.-2-translated-by-m-n-dutt-parimal-publications-delhi', 2)).toBe(
      '~mahabharata-vol.-{n}-translated-by-m-n-dutt-parimal-publications-delhi',
    );
    expect(idStem('NiAC_mahabharata-vol.-3-translated-by-m-n-dutt-parimal-publications-delhi', 3)).toBe(
      '~mahabharata-vol.-{n}-translated-by-m-n-dutt-parimal-publications-delhi',
    );
    // Short remainders keep their prefix: too little left to be sure.
    expect(idStem('abcd_vol-2', 2)).toBe('abcd_vol-{n}');
  });

  it('groups volumes whose codes differ', () => {
    const grouped = groupVolumes([
      card('mWJT_mahabharata-vol.-2-translated-by-m-n-dutt-parimal-publications-delhi', 'Mahabharata Vol. 2 Translated By M N Dutt'),
      card('NiAC_mahabharata-vol.-3-translated-by-m-n-dutt-parimal-publications-delhi', 'Mahabharata Vol. 3 Translated By M N Dutt'),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.kind).toBe('set');
  });
});
