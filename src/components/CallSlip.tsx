'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, formatBytes } from '@/lib/client/api';
import { useTray } from '@/lib/client/tray';
import { cn } from '@/lib/cn';
import { FORMAT_LABELS, type Fallback, type FormatsResponse, type FriendlyFormat } from '@/lib/shared/types';

const SECTION_LABEL = {
  books: 'Book',
  newspapers: 'Newspaper',
  magazines: 'Magazine',
  government: 'Government',
  manuscripts: 'Manuscript',
} as const;

type Step = { kind: 'list' } | { kind: 'format' } | { kind: 'started'; count: number };

/**
 * The selection tray, styled as a library call slip: you list what you want from the stacks,
 * then hand it in. The one deliberately decorative element in the interface.
 */
export function CallSlip() {
  const { items, open, setOpen, remove, clear, notice, dismissNotice } = useTray();
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'list' });
  const pathname = usePathname();

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (!open) setStep({ kind: 'list' });
  }, [open]);

  if (!hydrated || pathname.startsWith('/read/')) return null;
  if (items.length === 0 && step.kind !== 'started') return null;

  const count = items.length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="fixed right-4 bottom-4 z-30 flex items-baseline gap-3 border border-ink/15 bg-slip px-5 py-3 text-left shadow-[0_1px_0_var(--rule),0_8px_24px_-12px_rgb(0_0_0/0.35)] sm:right-8 sm:bottom-8"
        >
          <span className="font-serif text-lg italic text-ink">Call slip</span>
          <span className="text-sm text-ink-soft">
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25 data-[state=open]:animate-[fade_150ms_ease-out]" />
        <Dialog.Content
          className="fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-[420px] flex-col bg-slip text-ink shadow-2xl focus:outline-none data-[state=open]:animate-[slip-in_220ms_cubic-bezier(.2,.8,.2,1)]"
          aria-describedby={undefined}
        >
          <div className="slip-perforation h-2 w-full" aria-hidden />
          <div className="flex items-start justify-between px-7 pt-5 pb-4">
            <div>
              <Dialog.Title className="font-serif text-2xl italic">Call slip</Dialog.Title>
              <p className="mt-1 text-sm text-ink-soft">
                {step.kind === 'format'
                  ? 'Choose one format for everything on the slip.'
                  : step.kind === 'started'
                    ? 'Handed in.'
                    : `${count} ${count === 1 ? 'item' : 'items'} to fetch from the stacks.`}
              </p>
            </div>
            <Dialog.Close aria-label="Close" className="-mr-2 rounded-full p-2 text-ink-soft hover:text-ink">
              <X className="size-5" />
            </Dialog.Close>
          </div>

          {notice && step.kind === 'list' ? (
            <p className="mx-7 mb-3 flex items-start justify-between gap-3 border-l-2 border-accent pl-3 text-sm text-ink-soft">
              {notice}
              <button type="button" onClick={dismissNotice} className="text-ink-faint hover:text-ink" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </p>
          ) : null}

          {step.kind === 'list' ? (
            <>
              <ol className="slip-ruled flex-1 overflow-y-auto border-t border-slip-line">
                {items.map((item) => (
                  <li key={item.identifier} className="flex h-14 items-center gap-3 px-7">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-serif text-[1.05rem] leading-tight">{item.title}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {SECTION_LABEL[item.section]}
                        {item.publication ? `, ${item.publication}` : ''}
                        {item.date ? `, ${item.date}` : item.year ? `, ${item.year}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item.identifier)}
                      aria-label={`Remove “${item.title}”`}
                      className="rounded-full p-1.5 text-ink-faint hover:text-danger"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ol>
              <div className="flex items-center justify-between gap-4 border-t border-slip-line px-7 py-5">
                <button type="button" onClick={clear} className="text-sm text-ink-soft hover:text-danger">
                  Clear slip
                </button>
                <button
                  type="button"
                  onClick={() => setStep({ kind: 'format' })}
                  className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90"
                >
                  Download {count} {count === 1 ? 'item' : 'items'}
                </button>
              </div>
            </>
          ) : step.kind === 'format' ? (
            <FormatStep onBack={() => setStep({ kind: 'list' })} onStarted={(n) => setStep({ kind: 'started', count: n })} />
          ) : (
            <div className="flex-1 border-t border-slip-line px-7 py-8">
              <p className="font-serif text-xl">
                {step.count} {step.count === 1 ? 'item is' : 'items are'} downloading.
              </p>
              <p className="mt-2 text-ink-soft">Files go into your download folder, sorted by section.</p>
              <Link
                href="/downloads"
                onClick={() => setOpen(false)}
                className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink"
              >
                Show progress
              </Link>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FormatStep({ onBack, onStarted }: { onBack: () => void; onStarted: (count: number) => void }) {
  const items = useTray((s) => s.items);
  const clear = useTray((s) => s.clear);
  const [formats, setFormats] = useState<FormatsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [format, setFormat] = useState<FriendlyFormat>('pdf');
  const [fallback, setFallback] = useState<Fallback>('skip');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<FormatsResponse>('/api/formats', { body: { identifiers: items.map((i) => i.identifier) } })
      .then((res) => {
        if (cancelled) return;
        setFormats(res);
        const best = [...res.formats].sort((a, b) => b.available - a.available)[0];
        const pdf = res.formats.find((f) => f.format === 'pdf');
        setFormat(pdf && pdf.available > 0 ? 'pdf' : (best?.format ?? 'pdf'));
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
    // Counting is per opening of this step; the slip can't change underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api('/api/downloads', { body: { items, format, fallback } });
      const n = items.length;
      clear();
      onStarted(n);
    } catch (e) {
      setSubmitError((e as Error).message);
      setSubmitting(false);
    }
  }

  const downloadable = formats ? formats.total - formats.restricted.length - formats.unavailable.length : 0;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto border-t border-slip-line">
      <div className="flex-1 px-7 py-6">
        {loadError ? (
          <p className="text-danger">Couldn’t check formats: {loadError}</p>
        ) : !formats ? (
          <p className="flex items-center gap-2 text-ink-soft">
            <Loader2 className="size-4 animate-spin" /> Checking which formats each item has…
          </p>
        ) : (
          <>
            <RadioGroup.Root
              value={format}
              onValueChange={(v) => setFormat(v as FriendlyFormat)}
              aria-label="Format"
              className="flex flex-col"
            >
              {formats.formats.map((f) => {
                const none = f.available === 0;
                return (
                  <label
                    key={f.format}
                    className={cn(
                      'flex cursor-pointer items-center gap-4 border-b border-slip-line py-3.5',
                      none && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    <RadioGroup.Item
                      value={f.format}
                      disabled={none}
                      className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-ink/40 data-[state=checked]:border-accent"
                    >
                      <RadioGroup.Indicator className="size-2.5 rounded-full bg-accent" />
                    </RadioGroup.Item>
                    <span className="flex-1 font-serif text-lg">{FORMAT_LABELS[f.format]}</span>
                    <span className="text-right text-sm text-ink-soft tabular-nums">
                      {f.available} of {downloadable}
                      {f.bytes > 0 ? <span className="block text-xs text-ink-faint">about {formatBytes(f.bytes)}</span> : null}
                    </span>
                  </label>
                );
              })}
            </RadioGroup.Root>

            <label className="mt-6 flex items-center justify-between gap-4 text-sm">
              <span className="text-ink-soft">If an item doesn’t have it</span>
              <select
                value={fallback}
                onChange={(e) => setFallback(e.target.value as Fallback)}
                className="rounded-md border border-ink/20 bg-paper-raised px-2 py-1.5 text-ink"
              >
                <option value="skip">Skip it</option>
                <option value="pdf">Use PDF</option>
                <option value="text">Use plain text</option>
              </select>
            </label>

            {formats.restricted.length > 0 ? (
              <p className="mt-5 text-sm text-ink-soft">
                {formats.restricted.length} borrow-only {formats.restricted.length === 1 ? 'item' : 'items'} can’t be
                downloaded and will be skipped.
              </p>
            ) : null}
            {formats.unavailable.length > 0 ? (
              <p className="mt-2 text-sm text-ink-soft">
                {formats.unavailable.length} {formats.unavailable.length === 1 ? 'item' : 'items'} couldn’t be checked
                right now; they’ll be tried anyway.
              </p>
            ) : null}
          </>
        )}
        {submitError ? <p className="mt-4 text-sm text-danger">{submitError}</p> : null}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-slip-line px-7 py-5">
        <button type="button" onClick={onBack} className="text-sm text-ink-soft hover:text-ink">
          Back to slip
        </button>
        <button
          type="button"
          disabled={!formats || submitting}
          onClick={start}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Starting…' : 'Download'}
        </button>
      </div>
    </div>
  );
}
