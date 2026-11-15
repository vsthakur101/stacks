import { describe, expect, it } from 'vitest';
import { pageFromLines } from './ocr';

describe('recognised pages', () => {
  it('orders lines top to bottom and keeps each line box', () => {
    const page = pageFromLines([
      { text: 'चत्वारि तस्य वर्धन्ते', x: 0.2, y: 0.14, w: 0.5, h: 0.02 },
      { text: 'अभिवादनशीलस्य नित्यं', x: 0.2, y: 0.1, w: 0.5, h: 0.02 },
      { text: '  ', x: 0.2, y: 0.5, w: 0.1, h: 0.02 },
    ]);
    expect(page.text).toBe('अभिवादनशीलस्य नित्यं\nचत्वारि तस्य वर्धन्ते');
    expect(page.items).toEqual([
      [0, 20, 0.2, 0.1, 0.5, 0.02],
      [21, 21, 0.2, 0.14, 0.5, 0.02],
    ]);
  });
});
