import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coverSource, getCover, setCoverFetchForTests, sniffImageType } from './covers';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const network = vi.fn<(url: string) => Promise<Response>>();
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-covers-'));
  process.env.STACKS_COVERS = dir;
  network.mockReset();
  setCoverFetchForTests(((url: string) => network(url)) as unknown as typeof fetch);
});
afterEach(() => {
  setCoverFetchForTests(undefined);
  delete process.env.STACKS_COVERS;
  fs.rmSync(dir, { recursive: true, force: true });
});

function reply(body: Buffer | null, status = 200, url = 'https://archive.org/services/img/x') {
  const res = new Response(body ? new Uint8Array(body) : null, { status });
  Object.defineProperty(res, 'url', { value: url });
  return res;
}

describe('coverSource', () => {
  it('maps only the cover keys we serve, never arbitrary URLs', () => {
    expect(coverSource('ia', 'byte-magazine-1985-02')).toBe('https://archive.org/services/img/byte-magazine-1985-02');
    expect(coverSource('ol', '14348537-M')).toBe('https://covers.openlibrary.org/b/id/14348537-M.jpg?default=false');
    expect(coverSource('ola', '7005426-M')).toBe('https://covers.openlibrary.org/a/id/7005426-M.jpg?default=false');
    expect(coverSource('ia', '../etc/passwd')).toBeNull();
    expect(coverSource('ol', 'https://evil.test/x')).toBeNull();
    expect(coverSource('web', 'x')).toBeNull();
  });
});

describe('sniffImageType', () => {
  it('trusts the bytes, not a header', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('<html>not an image</html>'))).toBeNull();
  });
});

describe('getCover', () => {
  it('fetches once, then serves from disk', async () => {
    network.mockResolvedValue(reply(JPEG));
    expect(await getCover('ia', 'item1')).toMatchObject({ kind: 'image', type: 'image/jpeg' });
    expect(await getCover('ia', 'item1')).toMatchObject({ kind: 'image' });
    expect(network).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(dir, 'ia_item1'))).toBe(true);
  });

  it('shares one download between simultaneous requests', async () => {
    let release: (r: Response) => void = () => {};
    network.mockReturnValue(new Promise((r) => (release = r)));
    const both = Promise.all([getCover('ia', 'item2'), getCover('ia', 'item2')]);
    release(reply(JPEG));
    expect((await both).map((c) => c.kind)).toEqual(['image', 'image']);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("remembers archive.org's not-found image and Open Library's 404 as missing", async () => {
    network.mockResolvedValueOnce(reply(Buffer.from('png'), 200, 'https://archive.org/images/notfound.png'));
    expect(await getCover('ia', 'nothing')).toEqual({ kind: 'missing' });
    network.mockResolvedValueOnce(reply(null, 404));
    expect(await getCover('ol', '1-M')).toEqual({ kind: 'missing' });
    // Remembered: no second request within the week.
    expect(await getCover('ia', 'nothing')).toEqual({ kind: 'missing' });
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('refuses non-image bodies and does not store them', async () => {
    network.mockResolvedValue(reply(Buffer.from('<html>login</html>')));
    expect(await getCover('ia', 'weird')).toEqual({ kind: 'missing' });
    expect(fs.existsSync(path.join(dir, 'ia_weird'))).toBe(false);
  });

  it('rejects keys it does not serve without touching the network', async () => {
    expect(await getCover('ia', '../../x')).toEqual({ kind: 'invalid' });
    expect(network).not.toHaveBeenCalled();
  });
});
