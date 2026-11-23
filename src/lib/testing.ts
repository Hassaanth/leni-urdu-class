// Tests: placement ("where am I?") and unit checkpoints. Questions are objective (auto-checked),
// with no pictures, hints or second chances, so the score reflects what the learner knows.
import type { CourseIndexes } from '../content/loader';
import type { Course, Phrase, Unit } from '../types';
import { acceptedRoman, displayForm, rng, sample, shuffle, type Exercise, type Gender } from './exercises';
import type { DateKey } from './dates';
import type { ProgressState, Skill } from './progress';
import { fillSlots, romanWords } from './text';

export const PASS_MARK = 0.8;

export interface TestResult {
  date: DateKey;
  score: number; // 0–1, first-try correct
  right: number;
  total: number;
  passed: boolean;
  skills: Partial<Record<Skill, { right: number; total: number }>>;
  missed: string[];
}

export interface PlacementResult {
  date: DateKey;
  /** Highest course level passed (0 = start from the beginning). */
  level: number;
}

/** Items a unit can be tested on: its words/phrases plus any sentences it builds. */
export function unitItems(u: Unit): Phrase[] {
  return u.lessons.flatMap((l) => [...l.phrases, ...(l.builds ?? [])]).filter((p) => !p.slot);
}

const isSentence = (p: Phrase) => romanWords(p.roman).length >= 3;

/** n auto-checked questions about the given items, mixing listening, meaning, choosing and building. */
export function buildTestExercises(
  items: Phrase[],
  opts: { n: number; seed: number; gender: Gender; name: string; allowTyping?: boolean; prefix: string },
): Exercise[] {
  const rand = rng(opts.seed);
  const { gender, name } = opts;
  const chosen = sample(items, Math.min(opts.n, items.length), rand);
  const words = items.filter((p) => !isSentence(p));
  const sentences = items.filter(isSentence);
  return chosen.map((p, i) => {
    const id = `${opts.prefix}:${i}:${p.id}`;
    const pool = isSentence(p) && sentences.length >= 3 ? sentences : words.length >= 3 ? words : items;
    const others = sample(pool.filter((x) => x.id !== p.id && x.en !== p.en), 2, rand);
    const opts3 = shuffle([p, ...others], rand);
    const f = displayForm(p, gender, name);
    const kind = isSentence(p) ? ['build', 'hear', 'meaning'][i % 3] : (opts.allowTyping ? ['hear', 'meaning', 'urdu', 'type'] : ['hear', 'meaning', 'urdu'])[i % (opts.allowTyping ? 4 : 3)];
    switch (kind) {
      case 'hear':
        return { kind: 'listen', id, phrase: p, options: opts3.map((o) => fillSlots(o.en, name)), answer: opts3.indexOf(p), phraseIds: [p.id] };
      case 'meaning':
        return {
          kind: 'mcq', id, prompt: 'What does this mean?', promptSub: f.roman, promptPhrase: p,
          options: opts3.map((o) => ({ label: fillSlots(o.en, name) })), answer: opts3.indexOf(p), phraseIds: [p.id], optionsAreRoman: false,
        };
      case 'urdu':
        return {
          kind: 'mcq', id, prompt: `How do you say "${fillSlots(p.en, name)}"?`,
          options: opts3.map((o) => ({ label: displayForm(o, gender, name).roman, urdu: displayForm(o, gender, name).urdu })),
          answer: opts3.indexOf(p), phraseIds: [p.id], optionsAreRoman: true,
        };
      case 'type':
        return { kind: 'translate', id, phrase: p, accepted: acceptedRoman(p), phraseIds: [p.id] };
      default: {
        const answer = romanWords(f.roman);
        const extra = sample(items.flatMap((x) => romanWords(x.roman)).filter((w) => !answer.includes(w) && !w.includes('{')), 2, rand);
        return { kind: 'order', id, en: fillSlots(p.en, name), roman: f.roman, urdu: f.urdu, answer, tokens: shuffle([...answer, ...extra], rand), phraseIds: [p.id] };
      }
    }
  });
}

/** Placement stages = course levels (the last level is never needed to place someone). */
export function placementStages(course: Course): { level: number; title: string; items: Phrase[] }[] {
  return course.levels
    .slice(0, -1)
    .map((lvl) => ({ level: lvl.id, title: lvl.title, items: course.units.filter((u) => u.level === lvl.id).flatMap(unitItems) }))
    .filter((s) => s.items.length >= 3);
}

export function resultFrom(summary: { graded: number; firstTryCorrect: number; missedPhraseIds: string[]; skills: TestResult['skills'] }, date: DateKey): TestResult {
  const score = summary.graded ? summary.firstTryCorrect / summary.graded : 0;
  return { date, score, right: summary.firstTryCorrect, total: summary.graded, passed: score >= PASS_MARK, skills: summary.skills, missed: summary.missedPhraseIds };
}

export function recordTest(s: ProgressState, id: string, r: TestResult): ProgressState {
  const prev = s.tests[id];
  // Keep the latest attempt, but remember the best score.
  return { ...s, tests: { ...s.tests, [id]: { ...r, best: Math.max(r.score, prev?.best ?? 0) } } };
}

/** Mark every lesson up to and including a level as done ("tested out"). */
export function testOut(s: ProgressState, idx: CourseIndexes, course: Course, level: number, today: DateKey): ProgressState {
  const lessons = { ...s.lessons };
  for (const u of course.units.filter((x) => x.level <= level)) {
    for (const l of u.lessons) {
      if (!lessons[l.id]) lessons[l.id] = { completedOn: today, bestAccuracy: PASS_MARK, times: 0, testedOut: true };
    }
  }
  void idx;
  return { ...s, lessons, placement: { date: today, level } };
}

/** The learner's current level: the highest level whose lessons are all done (or tested out). */
export function currentLevel(s: ProgressState, course: Course): number {
  let reached = 0;
  for (const lvl of course.levels) {
    const ls = course.units.filter((u) => u.level === lvl.id).flatMap((u) => u.lessons);
    if (ls.length && ls.every((l) => s.lessons[l.id])) reached = lvl.id;
    else break;
  }
  return Math.max(reached, s.placement?.level ?? 0);
}

export const SKILL_INFO: Record<Skill, { label: string; practise: string; to: string }> = {
  listening: { label: 'Understanding spoken Urdu', practise: 'Listening drill', to: '/practice/listening' },
  reading: { label: 'Knowing what words mean', practise: 'Flashcards', to: '/practice/flashcards' },
  writing: { label: 'Building & writing Urdu', practise: 'Sentence builder', to: '/practice/order' },
  speaking: { label: 'Saying it from memory', practise: 'Speak from memory', to: '/speak/game/memory' },
};
