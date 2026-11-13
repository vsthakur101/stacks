'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function ReaderBar({ title, identifier }: { title: string; identifier: string }) {
  const router = useRouter();
  return (
    <div className="flex h-12 shrink-0 items-center gap-4 px-3 text-[#c9cdd3]">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.back() : router.push(`/item/${identifier}`))}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm hover:bg-white/10"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <p className="min-w-0 flex-1 truncate font-title text-[0.95rem]">{title}</p>
      <Link href={`/item/${identifier}`} className="hidden rounded-full px-3 py-1.5 text-sm hover:bg-white/10 sm:block">
        Details
      </Link>
    </div>
  );
}
