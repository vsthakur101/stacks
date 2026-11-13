import { describe, expect, it } from 'vitest';
import { createDownloadSchema } from './validation';

const item = (thumbnail?: string) => ({ identifier: 'byte-magazine-1985-02', title: 'BYTE', section: 'magazines', thumbnail });

describe('createDownloadSchema thumbnails', () => {
  it('accepts cover-cache paths and older full https URLs', () => {
    for (const t of ['/cover/ia/byte-magazine-1985-02', '/cover/ol/14348537-M', 'https://archive.org/services/img/x', undefined]) {
      expect(createDownloadSchema.safeParse({ items: [item(t)], format: 'pdf', fallback: 'skip' }).success).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const t of ['javascript:alert(1)', 'http://insecure.test/x.jpg', '//evil.test/x', 'data:image/png;base64,AAAA']) {
      expect(createDownloadSchema.safeParse({ items: [item(t)], format: 'pdf', fallback: 'skip' }).success).toBe(false);
    }
  });
});
