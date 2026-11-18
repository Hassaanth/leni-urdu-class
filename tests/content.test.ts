import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndexes, loadCourse } from '../src/content/loader';

const base = join(__dirname, '..', 'public', 'content');
const fsFetcher = async (p: string) => JSON.parse(readFileSync(join(base, p), 'utf8'));

describe('curriculum content', () => {
  it('loads and validates every content file with no issues', async () => {
    const { course, issues } = await loadCourse(fsFetcher);
    expect(issues).toEqual([]);
    expect(course.levels).toHaveLength(6);
    // Every level has at least one unit
    for (const lvl of course.levels) expect(course.units.some((u) => u.level === lvl.id)).toBe(true);
  });

  it('meets the minimum curriculum size (≥6 units, 3 lessons each, 8–12 items per lesson)', async () => {
    const { course } = await loadCourse(fsFetcher);
    expect(course.units.length).toBeGreaterThanOrEqual(6);
    for (const u of course.units) {
      expect(u.lessons.length).toBeGreaterThanOrEqual(3);
      for (const l of u.lessons) {
        expect(l.phrases.length, l.id).toBeGreaterThanOrEqual(8);
        expect(l.phrases.length, l.id).toBeLessThanOrEqual(12);
      }
    }
  });

  it('contains the required "Introducing Yourself" sample lesson with its 8 phrases', async () => {
    const { course } = await loadCourse(fsFetcher);
    const idx = buildIndexes(course);
    const lesson = idx.lessons.find((l) => l.title === 'Introducing Yourself');
    expect(lesson).toBeDefined();
    const romans = lesson!.phrases.map((p) => p.roman);
    for (const r of [
      'Assalamu alaikum',
      'Wa alaikum assalam',
      'Aap ka naam kya hai?',
      'Mera naam {name} hai.',
      'Aap kaise hain?',
      'Main theek hoon.',
      'Aap sunayein?',
      'Aapse mil kar khushi hui.',
    ])
      expect(romans).toContain(r);
    const types = new Set(lesson!.exercises!.map((e) => e.type));
    for (const t of ['complete', 'order', 'spokenQA', 'readAloud']) expect(types.has(t as never)).toBe(true);
    expect(lesson!.roleplayId).toBeDefined();
  });

  it('has at least 11 conversation scenarios and pronunciation drills', async () => {
    const { course } = await loadCourse(fsFetcher);
    expect(course.conversations.length).toBeGreaterThanOrEqual(11);
    expect(course.pronunciation.length).toBeGreaterThanOrEqual(8);
    expect(course.speaking.questions.length).toBeGreaterThanOrEqual(10);
    expect(course.speaking.passages.length).toBeGreaterThanOrEqual(6);
  });

  it('reports invalid content instead of crashing', async () => {
    const bad = async (p: string) => {
      if (p === 'units/u1-greetings.json')
        return { id: 'u1', level: 1, title: 'x', lessons: [{ id: 'l', title: 't', objective: 'o', phrases: [{ id: 'p', en: 'x', roman: 'abc', urdu: 'not urdu' }] }] };
      return fsFetcher(p);
    };
    const { issues } = await loadCourse(bad);
    expect(issues.some((i) => i.includes('urdu must contain Urdu script'))).toBe(true);
  });
});
