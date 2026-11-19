// Builds exercise sequences from lesson data. The lesson UI only knows about these
// Exercise objects, so new lessons need data only — no new interface code.
import type { CourseIndexes } from '../content/loader';
import type {
  Course,
  DialogueLine,
  FormPair,
  Lesson,
  LessonDialogue,
  Phrase,
  ReadAloudPassage,
  SpokenQuestion,
} from '../types';
import type { LearnStyle, Pace, Skill } from './progress';
import { fillSlots, romanWords } from './text';

// ---------- Random helpers (seeded, so a session is stable while it runs) ----------

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: T[], n: number, rand: () => number): T[] {
  return shuffle(arr, rand).slice(0, n);
}

// ---------- Phrase helpers ----------

export type Gender = 'masculine' | 'feminine';

/** The form to show this learner first (respects speaker gender where relevant). */
export function displayForm(p: Phrase, gender: Gender, name: string): FormPair {
  let form: FormPair = { roman: p.roman, urdu: p.urdu };
  if (p.genderVariants && p.genderVariants.by === 'speaker') form = p.genderVariants[gender];
  return { roman: fillSlots(form.roman, name), urdu: fillSlots(form.urdu, name) };
}

/** Every acceptable Roman Urdu answer for a phrase (slots kept as wildcards). */
export function acceptedRoman(p: Phrase): string[] {
  const out = [p.roman, ...(p.accept ?? [])];
  if (p.genderVariants) out.push(p.genderVariants.masculine.roman, p.genderVariants.feminine.roman);
  return [...new Set(out)];
}

/** Acceptable spoken forms in both scripts, for speech-recognition comparison. */
export function speechTargets(p: Phrase): FormPair[] {
  const out: FormPair[] = [{ roman: p.roman, urdu: p.urdu }];
  if (p.genderVariants) out.push(p.genderVariants.masculine, p.genderVariants.feminine);
  for (const a of p.accept ?? []) out.push({ roman: a, urdu: p.urdu });
  return out;
}

export const speechKey = (p: Phrase) => p.id;

// ---------- Exercise model ----------

export interface Option {
  label: string;
  sub?: string;
  urdu?: string;
}

export type Exercise =
  | { kind: 'intro'; id: string; phrase: Phrase }
  | { kind: 'mcq'; id: string; prompt: string; promptSub?: string; promptPhrase?: Phrase; options: Option[]; answer: number; explain?: string; phraseIds: string[]; optionsAreRoman: boolean }
  | { kind: 'listen'; id: string; phrase: Phrase; options: string[]; answer: number; phraseIds: string[] }
  | { kind: 'match'; id: string; pairs: { phraseId: string; en: string; roman: string }[]; phraseIds: string[] }
  | { kind: 'order'; id: string; en: string; roman: string; urdu: string; tokens: string[]; answer: string[]; explain?: string; phraseIds: string[] }
  | { kind: 'translate'; id: string; phrase: Phrase; accepted: string[]; phraseIds: string[] }
  | { kind: 'fill'; id: string; roman: string; urdu: string; en: string; options: string[]; answer: number; explain: string; phraseIds: string[] }
  | { kind: 'complete'; id: string; context: DialogueLine[]; prompt: string; options: (FormPair & { en: string })[]; answer: number; explain: string; phraseIds: string[] }
  | { kind: 'flashcard'; id: string; phrase: Phrase; direction: 'en-roman' | 'roman-en'; phraseIds: string[] }
  | { kind: 'repeat'; id: string; phrase: Phrase }
  | { kind: 'spokenQA'; id: string; question: SpokenQuestion }
  | { kind: 'readAloud'; id: string; passage: ReadAloudPassage }
  | { kind: 'dialogue'; id: string; mode: 'listen' | 'speak'; dialogue: LessonDialogue };

export type ExerciseKind = Exercise['kind'];

/** Exercises that must be answered correctly to advance (wrong answers come back later). */
export const GRADED: ExerciseKind[] = ['mcq', 'listen', 'match', 'order', 'translate', 'fill', 'complete'];
/** Speaking exercises: always skippable, never block progress. */
export const SPEAKING: ExerciseKind[] = ['repeat', 'spokenQA', 'readAloud'];

/** Which skill an exercise practises (for adapting future lessons). */
export function skillOf(e: Exercise): Skill | undefined {
  switch (e.kind) {
    case 'listen':
      return 'listening';
    case 'mcq':
    case 'match':
    case 'complete':
    case 'flashcard':
      return 'reading';
    case 'order':
    case 'translate':
    case 'fill':
      return 'writing';
    default:
      return undefined;
  }
}

export const isGraded = (e: Exercise) => GRADED.includes(e.kind);

const multiWord = (p: Phrase) => romanWords(p.roman).length >= 3 && !p.slot;

function distractorPool(lesson: Lesson, idx: CourseIndexes): Phrase[] {
  const unit = idx.unitByLesson.get(lesson.id);
  const unitPhrases = unit ? unit.lessons.flatMap((l) => l.phrases) : [];
  return unitPhrases.length >= 4 ? unitPhrases : idx.allPhrases;
}

function mcqFor(p: Phrase, pool: Phrase[], rand: () => number, gender: Gender, name: string, id: string): Exercise {
  const others = sample(pool.filter((x) => x.id !== p.id && x.en !== p.en), 2, rand);
  const opts = shuffle([p, ...others], rand);
  return {
    kind: 'mcq',
    id,
    prompt: `How do you say "${fillSlots(p.en, name)}"?`,
    options: opts.map((o) => ({ label: displayForm(o, gender, name).roman, urdu: displayForm(o, gender, name).urdu })),
    answer: opts.indexOf(p),
    explain: p.note,
    phraseIds: [p.id],
    optionsAreRoman: true,
  };
}

function comprehensionMcq(p: Phrase, pool: Phrase[], rand: () => number, gender: Gender, name: string, id: string): Exercise {
  const others = sample(pool.filter((x) => x.id !== p.id && x.en !== p.en), 2, rand);
  const opts = shuffle([p, ...others], rand);
  const f = displayForm(p, gender, name);
  return {
    kind: 'mcq',
    id,
    prompt: 'What does this mean?',
    promptSub: f.roman,
    promptPhrase: p,
    options: opts.map((o) => ({ label: fillSlots(o.en, name) })),
    answer: opts.indexOf(p),
    explain: p.literal ? `Word for word: "${p.literal}".` : p.note,
    phraseIds: [p.id],
    optionsAreRoman: false,
  };
}

function listenFor(p: Phrase, pool: Phrase[], rand: () => number, name: string, id: string): Exercise {
  const others = sample(pool.filter((x) => x.id !== p.id && x.en !== p.en), 2, rand);
  const opts = shuffle([p, ...others], rand);
  return { kind: 'listen', id, phrase: p, options: opts.map((o) => fillSlots(o.en, name)), answer: opts.indexOf(p), phraseIds: [p.id] };
}

function orderFor(id: string, en: string, roman: string, urdu: string, distractors: string[], rand: () => number, phraseIds: string[], explain?: string): Exercise {
  const answer = romanWords(roman);
  return { kind: 'order', id, en, roman, urdu, answer, tokens: shuffle([...answer, ...distractors], rand), explain, phraseIds };
}

export interface BuildOptions {
  gender: Gender;
  name: string;
  seed?: number;
  /** How the learner likes to learn: hear it first, see it written, or say it right away. */
  style?: LearnStyle;
  /** relaxed = 2 new phrases at a time + extra practice; fast = 4 at a time, more typing. */
  pace?: Pace;
  /** The skill the learner has been finding hardest; gets extra practice. */
  weakSkill?: Skill | null;
  /** Phrases from earlier lessons that are due or were missed — reviewed first as a warm-up. */
  warmup?: Phrase[];
}

/**
 * A lesson taught like a class:
 *  1. warm-up from earlier lessons (spaced recall),
 *  2. listen to a short real conversation that uses today's phrases,
 *  3. small steps: meet 2–4 phrases → recognise them → build/say them,
 *  4. mixed practice across the whole lesson,
 *  5. have the conversation yourself, speaking your part.
 * Recognition always comes before production, and the mix follows the learner's style and weak skill.
 */
export function buildLessonExercises(lesson: Lesson, course: Course, idx: CourseIndexes, opts: BuildOptions): Exercise[] {
  const rand = rng(opts.seed ?? Date.now());
  const { gender, name } = opts;
  const style = opts.style ?? 'listen';
  const pace = opts.pace ?? 'steady';
  // Distractors come from this lesson first, so learners choose between phrases they've just met.
  const pool = lesson.phrases.length >= 4 ? lesson.phrases : distractorPool(lesson, idx);
  const out: Exercise[] = [];
  const phrases = lesson.phrases;
  const chunkSize = pace === 'relaxed' ? 2 : pace === 'fast' ? 4 : 3;
  let n = 0;
  const nid = (k: string) => `${lesson.id}:${k}:${n++}`;
  const recognise = (p: Phrase, k: string): Exercise =>
    style === 'see' ? mcqFor(p, pool, rand, gender, name, nid(k)) : listenFor(p, pool, rand, name, nid(k));
  const build = (p: Phrase): Exercise => {
    const f = displayForm(p, gender, name);
    if (pace === 'fast' || !multiWord(p)) return { kind: 'translate', id: nid('translate'), phrase: p, accepted: acceptedRoman(p), phraseIds: [p.id] };
    const extra = sample(pool.flatMap((x) => romanWords(x.roman)).filter((w) => !romanWords(f.roman).includes(w) && !w.includes('{')), 1, rand);
    return orderFor(nid('build'), fillSlots(p.en, name), f.roman, f.urdu, extra, rand, [p.id]);
  };

  // 1. Warm-up from earlier lessons
  for (const p of (opts.warmup ?? []).slice(0, 3)) out.push({ ...recognise(p, 'warm'), id: nid('warm') });

  // 2. Hear the whole conversation first
  if (lesson.dialogue) out.push({ kind: 'dialogue', id: nid('dialogue-listen'), mode: 'listen', dialogue: lesson.dialogue });

  // 3. Small steps
  for (let i = 0; i < phrases.length; i += chunkSize) {
    const chunk = phrases.slice(i, i + chunkSize);
    for (const p of chunk) {
      out.push({ kind: 'intro', id: nid('intro'), phrase: p });
      if (style === 'speak') out.push({ kind: 'repeat', id: nid('repeat'), phrase: p });
    }
    const shuffled = shuffle(chunk, rand);
    // recognise: every phrase on relaxed, two otherwise
    for (const p of shuffled.slice(0, pace === 'relaxed' ? chunk.length : 2)) out.push(recognise(p, 'recognise'));
    // the other way round once per step, so both directions get practised
    if (shuffled[0]) out.push(style === 'see' ? listenFor(shuffled[0], pool, rand, name, nid('listen')) : mcqFor(shuffled[0], pool, rand, gender, name, nid('mcq')));
    // produce one phrase
    const buildable = shuffled.find(multiWord) ?? shuffled[0];
    out.push(build(buildable));
    // speak (already done per phrase for speakers)
    if (style !== 'speak') out.push({ kind: 'repeat', id: nid('repeat'), phrase: shuffled[shuffled.length - 1] });
    // extra practice on the learner's weakest skill
    const w = shuffled[1] ?? shuffled[0];
    if (opts.weakSkill === 'listening') out.push(listenFor(w, pool, rand, name, nid('extra-listen')));
    else if (opts.weakSkill === 'reading') out.push(comprehensionMcq(w, pool, rand, gender, name, nid('extra-read')));
    else if (opts.weakSkill === 'writing') out.push(build(w));
    else if (opts.weakSkill === 'speaking') out.push({ kind: 'repeat', id: nid('extra-say'), phrase: w });
  }

  // 4. Mixed practice over the whole lesson
  const matchPhrases = sample(phrases, Math.min(4, phrases.length), rand);
  if (matchPhrases.length >= 3) {
    out.push({
      kind: 'match',
      id: nid('match'),
      pairs: matchPhrases.map((p) => ({ phraseId: p.id, en: fillSlots(p.en, name), roman: displayForm(p, gender, name).roman })),
      phraseIds: matchPhrases.map((p) => p.id),
    });
  }
  out.push(comprehensionMcq(sample(phrases, 1, rand)[0], pool, rand, gender, name, nid('mcq-en')));
  const typeCount = pace === 'fast' ? 2 : pace === 'steady' ? 1 : 0;
  for (const p of sample(phrases.filter((x) => romanWords(x.roman).length <= 6), typeCount, rand)) {
    out.push({ kind: 'translate', id: nid('translate'), phrase: p, accepted: acceptedRoman(p), phraseIds: [p.id] });
  }

  // Authored exercises from the lesson file.
  for (const ex of lesson.exercises ?? []) {
    switch (ex.type) {
      case 'complete':
        out.push({ kind: 'complete', id: ex.id, context: ex.context, prompt: ex.prompt, options: ex.options, answer: ex.answer, explain: ex.explain, phraseIds: [] });
        break;
      case 'fill':
        out.push({ kind: 'fill', id: ex.id, roman: ex.roman, urdu: ex.urdu, en: ex.en, options: ex.options, answer: ex.answer, explain: ex.explain, phraseIds: [] });
        break;
      case 'mcq':
        out.push({ kind: 'mcq', id: ex.id, prompt: ex.prompt, options: ex.options.map((o) => ({ label: o })), answer: ex.answer, explain: ex.explain, phraseIds: [], optionsAreRoman: false });
        break;
      case 'order':
        out.push(orderFor(ex.id, ex.en, ex.roman, ex.urdu, ex.distractors ?? [], rand, [], ex.explain));
        break;
      case 'spokenQA': {
        const q = course.speaking.questions.find((x) => x.id === ex.questionId);
        if (q) out.push({ kind: 'spokenQA', id: ex.id, question: q });
        break;
      }
      case 'readAloud': {
        const p = course.speaking.passages.find((x) => x.id === ex.passageId);
        if (p) out.push({ kind: 'readAloud', id: ex.id, passage: p });
        break;
      }
    }
  }

  // 5. Now have the conversation yourself
  if (lesson.dialogue) out.push({ kind: 'dialogue', id: nid('dialogue-speak'), mode: 'speak', dialogue: lesson.dialogue });
  return out;
}

/** Mixed review from due/weak phrases: recall in both directions, listening and flashcards. */
export function buildReviewExercises(phrases: Phrase[], idx: CourseIndexes, opts: BuildOptions & { mode?: 'mixed' | 'flashcards' | 'listening' | 'recall' }): Exercise[] {
  const rand = rng(opts.seed ?? Date.now());
  const mode = opts.mode ?? 'mixed';
  const out: Exercise[] = [];
  phrases.forEach((p, i) => {
    const lesson = idx.lessonByPhrase.get(p.id);
    const pool = lesson ? distractorPool(lesson, idx) : idx.allPhrases;
    const id = `review:${p.id}:${i}`;
    const kind =
      mode === 'flashcards'
        ? 'flash'
        : mode === 'listening'
          ? 'listen'
          : mode === 'recall'
            ? 'translate'
            : (['flash', 'mcq', 'listen', 'translate', 'mcq-en'] as const)[i % 5];
    switch (kind) {
      case 'flash':
        out.push({ kind: 'flashcard', id, phrase: p, direction: rand() < 0.5 ? 'en-roman' : 'roman-en', phraseIds: [p.id] });
        break;
      case 'listen':
        out.push(listenFor(p, pool, rand, opts.name, id));
        break;
      case 'translate':
        out.push({ kind: 'translate', id, phrase: p, accepted: acceptedRoman(p), phraseIds: [p.id] });
        break;
      case 'mcq':
        out.push(mcqFor(p, pool, rand, opts.gender, opts.name, id));
        break;
      default:
        out.push(comprehensionMcq(p, pool, rand, opts.gender, opts.name, id));
    }
  });
  return out;
}

/** Matching game from a set of phrases (groups of 4). */
export function buildMatchExercises(phrases: Phrase[], opts: BuildOptions): Exercise[] {
  const out: Exercise[] = [];
  for (let i = 0; i + 3 <= phrases.length; i += 4) {
    const group = phrases.slice(i, i + 4);
    out.push({
      kind: 'match',
      id: `match:${i}`,
      pairs: group.map((p) => ({ phraseId: p.id, en: fillSlots(p.en, opts.name), roman: displayForm(p, opts.gender, opts.name).roman })),
      phraseIds: group.map((p) => p.id),
    });
  }
  return out;
}

/** Word-order sprint from multi-word phrases. */
export function buildOrderExercises(phrases: Phrase[], opts: BuildOptions): Exercise[] {
  const rand = rng(opts.seed ?? Date.now());
  return phrases.filter(multiWord).map((p, i) => {
    const f = displayForm(p, opts.gender, opts.name);
    return orderFor(`order:${p.id}:${i}`, p.en, f.roman, f.urdu, [], rand, [p.id]);
  });
}
