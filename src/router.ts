// Minimal hash router: works on static hosting and inside an installed PWA without server rewrites.
import { useSyncExternalStore } from 'react';

function current(): string {
  const h = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/learn';
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const full = useSyncExternalStore(subscribe, current, () => '/learn');
  const [path, qs = ''] = full.split('#')[0].split('?');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs) };
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = '#' + to;
  if (opts.replace) window.location.replace(url);
  else window.location.hash = to;
}

export function back(fallback = '/learn') {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}

export const href = (to: string) => '#' + to;
