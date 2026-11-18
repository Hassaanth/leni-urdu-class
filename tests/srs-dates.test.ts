import { describe, expect, it } from 'vitest';
import { addDays, currentStreak, dateKey, diffDays, lastNDays, longestStreak, weekStart } from '../src/lib/dates';
import { dueQueue, explain, grade, INTERVALS, mastery, newCard } from '../src/lib/srs';

describe('dates', () => {
  it('formats local dates', () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dateKey(new Date(2026, 0, 6, 0, 1))).toBe('2026-01-06');
  });
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('is unaffected by DST changes', () => {
    // US and EU DST transitions in 2026
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });
  it('computes streaks without double counting repeated sessions', () => {
    const days = ['2026-10-20', '2026-10-21', '2026-10-21', '2026-10-22'];
    expect(currentStreak(days, '2026-10-22')).toBe(3);
    // today not practised yet: yesterday's streak still stands
    expect(currentStreak(days, '2026-10-23')).toBe(3);
    // a full missed day breaks it
    expect(currentStreak(days, '2026-10-24')).toBe(0);
    expect(longestStreak(['2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07'])).toBe(3);
  });
  it('lists the last 7 days and week starts', () => {
    expect(lastNDays('2026-10-23', 3)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
    expect(weekStart('2026-10-23')).toBe('2026-10-19'); // Friday -> Monday
  });
});

describe('spaced repetition', () => {
  const today = '2026-10-23';

  it('new cards are due today and "new"', () => {
    const c = newCard('p', today);
    expect(c.due).toBe(today);
    expect(mastery(c)).toBe('new');
  });

  it('grows the interval after correct recall on separate days', () => {
    let c = newCard('p', today);
    c = grade(c, true, today);
    expect(c.box).toBe(1);
    expect(c.due).toBe(addDays(today, INTERVALS[1]));
    c = grade(c, true, c.due);
    expect(c.box).toBe(2);
    expect(diffDays(c.lastReviewed!, c.due)).toBe(INTERVALS[2]);
    c = grade(c, true, c.due);
    expect(diffDays(c.lastReviewed!, c.due)).toBe(INTERVALS[3]);
    expect(mastery(c)).toBe('familiar');
  });

  it('only advances once per day', () => {
    let c = newCard('p', today);
    for (let i = 0; i < 5; i++) c = grade(c, true, today);
    expect(c.box).toBe(1);
    expect(c.correct).toBe(5);
  });

  it('shrinks the interval after a mistake and makes the card due now', () => {
    let c = { ...newCard('p', today), box: 5, correct: 5 };
    c = grade(c, false, today);
    expect(c.box).toBe(3);
    expect(c.due).toBe(today);
    expect(c.incorrect).toBe(1);
    expect(explain(c, today)).toMatch(/missed/i);
    // a correct answer later the same day schedules it for tomorrow, not weeks out
    c = grade(c, true, today);
    expect(c.due).toBe(addDays(today, INTERVALS[3]));
  });

  it('prioritises recent mistakes, then overdue cards', () => {
    const a = { ...newCard('a', '2026-10-01'), due: '2026-10-10' }; // very overdue
    const b = grade(newCard('b', today), false, today); // just missed
    const c = { ...newCard('c', today), due: '2026-12-01' }; // not due
    const q = dueQueue([a, b, c], today).map((x) => x.id);
    expect(q).toEqual(['b', 'a']);
  });
});
