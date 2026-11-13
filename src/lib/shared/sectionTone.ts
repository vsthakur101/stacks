const SECTIONS = ['books', 'newspapers', 'magazines', 'government', 'manuscripts'];

/** Which section's colour a path uses (Poster theme). Book subpages (subjects, authors) count as Books. */
export function sectionForPath(pathname: string): string | undefined {
  const first = pathname.split('/')[1] ?? '';
  if (SECTIONS.includes(first)) return first;
  if (first === 'subjects' || first === 'authors') return 'books';
  return undefined;
}
