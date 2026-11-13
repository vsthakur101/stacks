'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

interface DownloadedState {
  ids: Set<string>;
  loaded: boolean;
  refresh: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

/** What's already in the download folder. One small request per page view, refreshed on focus. */
export const useDownloadedStore = create<DownloadedState>()((set) => ({
  ids: new Set(),
  loaded: false,
  refresh: () => {
    inflight ??= fetch('/api/downloaded')
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { data?: { identifiers: string[] } } | null) => {
        if (json?.data) set({ ids: new Set(json.data.identifiers), loaded: true });
      })
      .catch(() => undefined)
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
}));

let listening = false;

/** True if any of `identifiers` is already downloaded. */
export function useIsDownloaded(identifiers: readonly string[]): boolean {
  const ids = useDownloadedStore((s) => s.ids);
  const loaded = useDownloadedStore((s) => s.loaded);
  const refresh = useDownloadedStore((s) => s.refresh);
  useEffect(() => {
    if (!loaded) void refresh();
    if (!listening) {
      listening = true;
      window.addEventListener('focus', () => void useDownloadedStore.getState().refresh());
    }
  }, [loaded, refresh]);
  return identifiers.some((id) => ids.has(id));
}
