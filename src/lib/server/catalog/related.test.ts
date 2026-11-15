import { describe, expect, it } from 'vitest';
import { parseRelated } from './related';

describe('related items', () => {
  it('keeps texts, drops the item itself, cleans fields', () => {
    const cards = parseRelated(
      {
        hits: {
          hits: [
            { _id: 'laghu', _source: { title: ['Laghu Siddhanta Kaumudi '], creator: ['Varadarajacharya'], date: ['1950-01-01'], mediatype: ['texts'] } },
            { _id: 'self', _source: { title: ['Same'], mediatype: ['texts'] } },
            { _id: 'song', _source: { title: ['A song'], mediatype: ['audio'] } },
          ],
        },
      },
      'self',
    );
    expect(cards).toEqual([{ identifier: 'laghu', title: 'Laghu Siddhanta Kaumudi', isCollection: false, creator: 'Varadarajacharya', year: 1950, date: '1950', thumbnail: '/cover/ia/laghu' }]);
  });
});
