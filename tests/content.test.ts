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
        if (l.kind === 'words') {
          // Word lessons: a few words at a time, each with a picture
          expect(l.phrases.length, l.id).toBeGreaterThanOrEqual(3);
          expect(l.phrases.length, l.id).toBeLessThanOrEqual(5);
          for (const p of l.phrases) expect(p.emoji, p.id).toBeTruthy();
          continue;
        }
        if (l.kind === 'build') {
          // Building Blocks: a handful of words, one pattern, many sentences
          expect(l.phrases.length, l.id).toBeGreaterThanOrEqual(6);
          expect(l.builds!.length, l.id).toBeGreaterThanOrEqual(8);
          expect(l.pattern, l.id).toBeDefined();
          continue;
        }
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
      'Suniye',
      'Ji, boliye',
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

describe('characters, story and guidebooks', () => {
  it('every unit has a host and guidebook, every conversation partner is a real character', async () => {
    const { course } = await loadCourse(fsFetcher);
    const ids = new Set(course.characters.map((c) => c.id));
    expect(ids.has('leni')).toBe(true);
    expect(course.story?.title).toBeTruthy();
    const idx = buildIndexes(course);
    for (const u of course.units) {
      expect(ids.has(u.host!), u.id).toBe(true);
      expect(u.guide!.length, u.id).toBeGreaterThanOrEqual(3);
      for (const g of u.guide!) for (const ex of g.examples) expect(idx.phraseById.has(ex), `${u.id}: ${ex}`).toBe(true);
      for (const l of u.lessons) if (l.dialogue) expect(ids.has(l.dialogue.partner.character!), l.id).toBe(true);
    }
    for (const c of course.conversations) expect(ids.has(c.partner.character!), c.id).toBe(true);
  });

  it('lesson tips are taught inside the lesson', async () => {
    const { course } = await loadCourse(fsFetcher);
    const idx = buildIndexes(course);
    const { buildLessonExercises } = await import('../src/lib/exercises');
    const l = idx.lessonById.get('l1-intro')!;
    const tips = buildLessonExercises(l, course, idx, { gender: 'masculine', name: 'Ali', seed: 1 }).filter((e) => e.kind === 'tip');
    expect(tips.length).toBe(l.tips!.length);
  });
});

describe('Building Blocks path', () => {
  it('comes first, and every sentence only uses words already taught (or explained in a note)', async () => {
    const { course } = await loadCourse(fsFetcher);
    const idx = buildIndexes(course);
    expect(idx.lessons[0].id).toBe('w1');
    // all word lessons come before any sentence lesson
    const firstSentence = idx.lessons.findIndex((l) => l.kind !== 'words');
    expect(idx.lessons.slice(firstSentence).some((l) => l.kind === 'words')).toBe(false);
    expect(firstSentence).toBeGreaterThanOrEqual(20);
    const { romanKey, romanWords } = await import('../src/lib/text');
    const known = new Set<string>();
    const extra = new Set(['ali', 'bilal', 'zara', 'acha', 'beta', 'kuch', 'please', 'aaya', 'bol', 'aayenge', 'jayenge', 'kaisi', 'gayi', 'aaungi', 'jaungi', 'rehte', 'khayi', 'pi', 'aapne', 'thori', 'ne']);
    for (const l of idx.lessons.filter((x) => x.kind === 'build')) {
      for (const w of l.phrases) for (const part of romanWords(w.roman)) known.add(romanKey(part));
      for (const b of l.builds!) {
        const unknown = romanWords(b.roman)
          .filter((w) => !w.startsWith('{'))
          .map(romanKey)
          .filter((k) => !known.has(k) && !extra.has(k) && ![...extra].some((e) => romanKey(e) === k));
        expect(unknown, `${l.id}: ${b.roman}`).toEqual([]);
      }
    }
  });
});
