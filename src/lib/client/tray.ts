'use client';

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { TrayItem } from '@/lib/shared/types';

export const TRAY_CAP = 500;

/** localStorage that degrades to memory when storage is blocked (private windows, previews). */
const memory = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      memory.set(k, v);
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      memory.delete(k);
    }
  },
};

interface TrayState {
  items: TrayItem[];
  open: boolean;
  /** Message shown in the slip after a capped bulk add. */
  notice: string | null;
  add: (items: TrayItem[]) => void;
  remove: (identifier: string) => void;
  toggle: (item: TrayItem) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
  dismissNotice: () => void;
}

export const useTray = create<TrayState>()(
  persist(
    (set, get) => ({
      items: [],
      open: false,
      notice: null,
      add: (incoming) => {
        const existing = new Set(get().items.map((i) => i.identifier));
        const fresh = incoming.filter((i) => !existing.has(i.identifier));
        const room = TRAY_CAP - get().items.length;
        const accepted = fresh.slice(0, Math.max(0, room));
        set({
          items: [...get().items, ...accepted],
          notice:
            accepted.length < fresh.length
              ? `The slip holds ${TRAY_CAP} items. ${fresh.length - accepted.length} weren’t added.`
              : get().notice,
        });
      },
      remove: (identifier) => set({ items: get().items.filter((i) => i.identifier !== identifier) }),
      toggle: (item) => {
        if (get().items.some((i) => i.identifier === item.identifier)) get().remove(item.identifier);
        else get().add([item]);
      },
      clear: () => set({ items: [], notice: null }),
      setOpen: (open) => set({ open }),
      dismissNotice: () => set({ notice: null }),
    }),
    {
      name: 'stacks-call-slip',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

export function useIsSelected(identifier: string | undefined): boolean {
  return useTray((s) => (identifier ? s.items.some((i) => i.identifier === identifier) : false));
}
