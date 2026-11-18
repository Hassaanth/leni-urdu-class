// Local-calendar date helpers. All progress is keyed by the learner's local date ("YYYY-MM-DD"),
// computed from date components (not UTC) so streaks don't break across time zones or DST changes.

export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date = new Date()): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(k: DateKey): { y: number; m: number; d: number } {
  const [y, m, d] = k.split('-').map(Number);
  return { y, m, d };
}

/** Add calendar days. Uses UTC arithmetic on the components, so DST never shifts the result. */
export function addDays(k: DateKey, n: number): DateKey {
  const { y, m, d } = parseKey(k);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole calendar days from a to b (b - a). */
export function diffDays(a: DateKey, b: DateKey): number {
  const pa = parseKey(a);
  const pb = parseKey(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/**
 * Consecutive active days ending today. If today has no activity yet, the streak
 * ending yesterday still counts (it isn't broken until a full day is missed).
 */
export function currentStreak(activeDays: Iterable<DateKey>, today: DateKey): number {
  const set = new Set(activeDays);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function longestStreak(activeDays: Iterable<DateKey>): number {
  const sorted = [...new Set(activeDays)].sort();
  let best = 0;
  let run = 0;
  let prev: DateKey | null = null;
  for (const d of sorted) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** The last n date keys ending today, oldest first. */
export function lastNDays(today: DateKey, n: number): DateKey[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

/** Monday-based start of the week containing the given day. */
export function weekStart(k: DateKey): DateKey {
  const { y, m, d } = parseKey(k);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(k, -((dow + 6) % 7));
}
