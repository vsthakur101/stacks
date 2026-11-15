'use client';

import { Pause, Play, Square } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rect } from '@/lib/shared/annotations';
import { speechChunks, speechLanguage, type SpeechChunk, type SpeechItem } from '@/lib/shared/speech';

const RATES = [0.75, 0.9, 1, 1.15, 1.3, 1.5];
const VOICE_KEY = 'stacks-voice';

/** A page's text items with their boxes as page fractions. */
async function pageSpeechItems(doc: PDFDocumentProxy, n: number): Promise<SpeechItem[]> {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return content.items.flatMap((item) => {
    if (!('str' in item) || !item.str.trim()) return [];
    const t = item.transform as number[];
    const [x, y] = vp.convertToViewportPoint(t[4]!, t[5]!) as [number, number];
    const h = Math.hypot(t[2]!, t[3]!) || 10;
    return [{ str: item.str, rect: { x: x / vp.width, y: (y - h) / vp.height, w: Math.abs(item.width) / vp.width, h: h / vp.height } }];
  });
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

function savedVoices(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VOICE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Reads the current page aloud, sentence by sentence, then turns the page and carries on. Offline: the
 * Mac's own voices (Lekha for Hindi). A generation counter ignores callbacks from cancelled speech.
 */
export function useReadAloud({
  doc,
  page,
  total,
  go,
  file,
  recognised,
}: {
  doc: PDFDocumentProxy | null;
  page: number;
  total: number;
  go: (n: number) => void;
  file: string;
  /** The book's text was recognised on this Mac: read that instead of the PDF's own text layer. */
  recognised: boolean;
}) {
  // Decided after mount: the server can't know, and a different first render would break hydration.
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported('speechSynthesis' in window), []);
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [chunks, setChunks] = useState<SpeechChunk[]>([]);
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [lang, setLang] = useState<'hi' | 'en'>('en');
  const [voiceUri, setVoiceUri] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const gen = useRef(0);
  const settings = useRef({ rate, voiceUri, voices });
  settings.current = { rate, voiceUri, voices };

  useEffect(() => {
    if (!supported) return;
    void loadVoices().then(setVoices);
    setVoiceUri(savedVoices());
    return () => window.speechSynthesis.cancel();
  }, [supported]);

  const voiceFor = useCallback((l: 'hi' | 'en') => {
    const { voices: vs, voiceUri: chosen } = settings.current;
    return vs.find((v) => v.voiceURI === chosen[l]) ?? vs.find((v) => v.lang === (l === 'hi' ? 'hi-IN' : 'en-IN')) ?? vs.find((v) => v.lang.startsWith(l)) ?? null;
  }, []);

  const speak = useCallback(
    (list: SpeechChunk[], i: number, l: 'hi' | 'en', g: number) => {
      if (g !== gen.current) return;
      if (i >= list.length) {
        // End of the page: turn and carry on (the page effect starts the next page).
        if (page < total) go(page + 1);
        else setState('idle');
        return;
      }
      setIndex(i);
      const u = new SpeechSynthesisUtterance(list[i]!.text);
      const voice = voiceFor(l);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? (l === 'hi' ? 'hi-IN' : 'en-US');
      u.rate = settings.current.rate;
      u.onend = () => speak(list, i + 1, l, g);
      u.onerror = (e) => {
        if (g === gen.current && e.error !== 'interrupted' && e.error !== 'canceled') {
          setNote('Speech stopped: the voice isn’t available.');
          setState('idle');
        }
      };
      window.speechSynthesis.speak(u);
    },
    [go, page, total, voiceFor],
  );

  /** Starts reading the current page from its first sentence (or `from`). */
  const startPage = useCallback(
    async (from = 0) => {
      if (!doc || !supported) return;
      const g = ++gen.current;
      window.speechSynthesis.cancel();
      const items = recognised
        ? await fetch(`/api/book/page?${new URLSearchParams({ file, page: String(page) })}`)
            .then((r) => r.json())
            .then((j: { data?: SpeechItem[] }) => j.data ?? [])
            .catch(() => [])
        : await pageSpeechItems(doc, page).catch(() => []);
      if (g !== gen.current) return;
      const list = speechChunks(items);
      setChunks(list);
      const l = speechLanguage(list.map((c) => c.text).join(' '));
      setLang(l);
      if (!list.length) {
        setNote(`Page ${page} has no readable text${page < total ? '; going on to the next page' : ''}.`);
        if (page < total) setTimeout(() => g === gen.current && go(page + 1), 1200);
        else setState('idle');
        return;
      }
      setNote(null);
      speak(list, from, l, g);
    },
    [doc, go, page, speak, supported, total, recognised, file],
  );

  // While reading, a new page (turned by hand or at the end of the last) is read from its top; so is the
  // first page once the book has loaded, if Read aloud was pressed before that.
  useEffect(() => {
    if (state === 'playing') void startPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new page (or the book arriving) restarts reading
  }, [page, doc]);

  const play = () => {
    if (state === 'paused') {
      window.speechSynthesis.resume();
      setState('playing');
      return;
    }
    setState('playing');
    void startPage(0);
  };
  const pause = () => {
    window.speechSynthesis.pause();
    setState('paused');
  };
  const stop = useCallback(() => {
    gen.current++;
    window.speechSynthesis.cancel();
    setState('idle');
    setChunks([]);
    setNote(null);
  }, []);
  const changeRate = (r: number) => {
    setRate(r);
    settings.current.rate = r;
    if (state === 'playing') void startPage(index); // apply now, from this sentence
  };
  const changeVoice = (uri: string) => {
    const next = { ...voiceUri, [lang]: uri };
    setVoiceUri(next);
    settings.current.voiceUri = next;
    try {
      localStorage.setItem(VOICE_KEY, JSON.stringify(next));
    } catch {
      /* private window: the choice lasts this visit */
    }
    if (state === 'playing') void startPage(index);
  };

  const current: Rect[] = state !== 'idle' ? (chunks[index]?.rects ?? []) : [];
  const langVoices = voices.filter((v) => v.lang.startsWith(lang));
  return { supported, state, play, pause, stop, rate, changeRate, voices: langVoices, voice: voiceFor(lang), changeVoice, lang, index, count: chunks.length, current, note };
}

export type ReadAloud = ReturnType<typeof useReadAloud>;

export function ReadAloudBar({ ra, page, onStop }: { ra: ReadAloud; page: number; onStop: () => void }) {
  const btn = 'inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-raised';
  return (
    <div role="region" aria-label="Read aloud" className="t-tray absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-full border border-rule bg-panel px-2 py-1 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.4)]">
      {ra.state === 'playing' ? (
        <button type="button" className={btn} onClick={ra.pause} aria-label="Pause">
          <Pause className="size-4" />
        </button>
      ) : (
        <button type="button" className={btn} onClick={ra.play} aria-label={ra.state === 'paused' ? 'Resume' : 'Read this page aloud'}>
          <Play className="size-4" />
        </button>
      )}
      <button type="button" className={btn} onClick={onStop} aria-label="Stop reading">
        <Square className="size-3.5" />
      </button>
      <span className="px-1 text-sm tabular-nums text-ink-soft" aria-live="polite">
        {ra.note ?? (ra.count ? `Page ${page}, sentence ${ra.index + 1} of ${ra.count}` : 'Ready')}
      </span>
      <label className="sr-only" htmlFor="ra-rate">
        Speed
      </label>
      <select id="ra-rate" value={ra.rate} onChange={(e) => ra.changeRate(Number(e.target.value))} className="rounded-full border border-rule bg-paper px-2 py-1.5 text-sm text-ink">
        {RATES.map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>
      {ra.voices.length ? (
        <>
          <label className="sr-only" htmlFor="ra-voice">
            Voice
          </label>
          <select id="ra-voice" value={ra.voice?.voiceURI ?? ''} onChange={(e) => ra.changeVoice(e.target.value)} className="max-w-44 rounded-full border border-rule bg-paper px-2 py-1.5 text-sm text-ink">
            {ra.voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="px-1 text-sm text-ink-faint">{ra.lang === 'hi' ? 'No Hindi voice found' : 'Default voice'}</span>
      )}
    </div>
  );
}

/** The sentence being read, marked on the page. */
export function SpeakingMarks({ rects }: { rects: Rect[] }) {
  if (!rects.length) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {rects.map((r, i) => (
        <div key={i} className="speaking-mark absolute rounded-[2px]" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
      ))}
    </div>
  );
}
