// App-wide progress store persisted locally. Swappable storage adapter so account sync
// can be added later without touching components.
import { useSyncExternalStore } from 'react';
import { newlyUnlocked } from '../lib/achievements';
import { dateKey } from '../lib/dates';
import { initialState, migrate, type ProgressState } from '../lib/progress';

export interface StorageAdapter {
  load(): string | null;
  save(data: string): void;
  clear(): void;
}

export const STORAGE_KEY = 'bolo-urdu:v1';

export function localStorageAdapter(key = STORAGE_KEY): StorageAdapter {
  let memory: string | null = null; // fallback when storage is blocked (private mode etc.)
  return {
    load() {
      try {
        return localStorage.getItem(key);
      } catch {
        return memory;
      }
    },
    save(data) {
      memory = data;
      try {
        localStorage.setItem(key, data);
      } catch {
        /* storage full or blocked — progress stays in memory for this session */
      }
    },
    clear() {
      memory = null;
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function memoryAdapter(initial: string | null = null): StorageAdapter {
  let data = initial;
  return {
    load: () => data,
    save: (d) => {
      data = d;
    },
    clear: () => {
      data = null;
    },
  };
}

export interface Toast {
  id: number;
  icon: string;
  title: string;
  body?: string;
}

interface AchievementContext {
  unitLessonIds: string[][];
  conversationCount: number;
}

export function createStore(adapter: StorageAdapter) {
  let state: ProgressState;
  try {
    const raw = adapter.load();
    state = raw ? migrate(JSON.parse(raw)) : initialState();
  } catch {
    state = initialState();
  }
  const listeners = new Set<() => void>();
  let toasts: Toast[] = [];
  const toastListeners = new Set<() => void>();
  let toastId = 1;
  let ctx: AchievementContext | null = null;

  const emit = () => listeners.forEach((l) => l());
  const emitToasts = () => toastListeners.forEach((l) => l());

  function pushToast(t: Omit<Toast, 'id'>) {
    const toast = { ...t, id: toastId++ };
    toasts = [...toasts, toast];
    emitToasts();
    setTimeout(() => dismissToast(toast.id), 4500);
  }
  function dismissToast(id: number) {
    toasts = toasts.filter((t) => t.id !== id);
    emitToasts();
  }

  function setState(next: ProgressState) {
    if (next === state) return;
    if (ctx) {
      const today = dateKey();
      const unlocked = newlyUnlocked(next, today, ctx);
      if (unlocked.length) {
        const achievements = { ...next.achievements };
        for (const a of unlocked) achievements[a.id] = today;
        next = { ...next, achievements };
        for (const a of unlocked) pushToast({ icon: a.icon, title: `Achievement: ${a.title}`, body: a.description });
      }
    }
    state = next;
    adapter.save(JSON.stringify(state));
    emit();
  }

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    update(fn: (s: ProgressState) => ProgressState) {
      setState(fn(state));
    },
    reset() {
      adapter.clear();
      state = initialState();
      emit();
    },
    exportJson: () => JSON.stringify(state, null, 2),
    setAchievementContext(c: AchievementContext) {
      ctx = c;
    },
    toasts: {
      get: () => toasts,
      subscribe(l: () => void) {
        toastListeners.add(l);
        return () => toastListeners.delete(l);
      },
      push: pushToast,
      dismiss: dismissToast,
    },
  };
}

export type Store = ReturnType<typeof createStore>;

export const store = createStore(localStorageAdapter());

// Keep tabs in sync: progress saved in another tab replaces ours.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        store.update(() => migrate(JSON.parse(e.newValue!)));
      } catch {
        /* ignore malformed */
      }
    }
  });
}

export function useProgress<T>(selector: (s: ProgressState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

export function useSettings() {
  return useProgress((s) => s.settings);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(store.toasts.subscribe, store.toasts.get);
}
