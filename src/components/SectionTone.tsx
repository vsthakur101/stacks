'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect } from 'react';
import { sectionForPath } from '@/lib/shared/sectionTone';

/** Keeps the section colour in step on client-side navigation (the server sets it on full loads). */
export function SectionTone() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const section = sectionForPath(pathname);
    if (section) document.documentElement.dataset.section = section;
    else delete document.documentElement.dataset.section;
  }, [pathname]);
  return null;
}
