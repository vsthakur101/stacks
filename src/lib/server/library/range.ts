/** Parses a single-range "Range: bytes=…" header against a file size. Multi-range requests are not supported. */
export type ByteRange = { start: number; end: number } | 'unsatisfiable' | null;

export function parseRange(header: string | null, size: number): ByteRange {
  if (!header) return null;
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null; // malformed or multi-range: serve the whole file
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  let start: number;
  let end: number;
  if (a === '') {
    // suffix range: last N bytes
    const n = Number(b);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}
