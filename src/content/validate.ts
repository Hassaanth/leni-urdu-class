// Runtime validation for curriculum JSON. Content is loaded at runtime (so lessons can be
// added without rebuilding), so we never trust its shape. Invalid items are reported and skipped.
import type {
  AuthoredExercise,
  ConversationScenario,
  CourseIndex,
  Lesson,
  Phrase,
  PronunciationDrill,
  SpeakingContent,
  Unit,
} from '../types';

const URDU_RE = /[؀-ۿ]/;
const LATIN_RE = /[A-Za-z]/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export class Issues {
  list: string[] = [];
  add(path: string, msg: string) {
    this.list.push(`${path}: ${msg}`);
  }
}

function checkForms(o: Obj, path: string, issues: Issues, needEn = true): boolean {
  let ok = true;
  if (!isStr(o.roman) || !LATIN_RE.test(o.roman as string)) {
    issues.add(path, 'roman must be Latin-script text');
    ok = false;
  }
  if (!isStr(o.urdu) || !URDU_RE.test(o.urdu as string)) {
    issues.add(path, 'urdu must contain Urdu script');
    ok = false;
  }
  if (needEn && !isStr(o.en)) {
    issues.add(path, 'en (English meaning) is required');
    ok = false;
  }
  return ok;
}

export function validatePhrase(raw: unknown, path: string, issues: Issues): Phrase | null {
  if (!isObj(raw)) {
    issues.add(path, 'phrase must be an object');
    return null;
  }
  if (!isStr(raw.id)) {
    issues.add(path, 'phrase id missing');
    return null;
  }
  if (!checkForms(raw, `${path}(${raw.id})`, issues)) return null;
  if (raw.accept !== undefined && !(Array.isArray(raw.accept) && raw.accept.every(isStr))) {
    issues.add(`${path}(${raw.id})`, 'accept must be a list of strings');
    return null;
  }
  if (raw.genderVariants !== undefined) {
    const g = raw.genderVariants;
    if (!isObj(g) || !isObj(g.masculine) || !isObj(g.feminine) || !isStr(g.explain)) {
      issues.add(`${path}(${raw.id})`, 'genderVariants needs masculine, feminine and explain');
      return null;
    }
    if (!checkForms(g.masculine, `${path}(${raw.id}).masculine`, issues, false)) return null;
    if (!checkForms(g.feminine, `${path}(${raw.id}).feminine`, issues, false)) return null;
  }
  const hasSlot = (raw.roman as string).includes('{name}');
  if (hasSlot && raw.slot !== 'name') issues.add(`${path}(${raw.id})`, 'uses {name} but slot is not "name"');
  return raw as unknown as Phrase;
}

function validateExercise(raw: unknown, path: string, issues: Issues): AuthoredExercise | null {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.type)) {
    issues.add(path, 'exercise needs id and type');
    return null;
  }
  const p = `${path}(${raw.id})`;
  const answerOk = (opts: unknown) =>
    Array.isArray(opts) && opts.length >= 2 && Number.isInteger(raw.answer) && (raw.answer as number) >= 0 && (raw.answer as number) < opts.length;
  switch (raw.type) {
    case 'mcq':
      if (!isStr(raw.prompt) || !answerOk(raw.options) || !(raw.options as unknown[]).every(isStr)) {
        issues.add(p, 'mcq needs prompt, ≥2 string options and a valid answer index');
        return null;
      }
      break;
    case 'fill':
      if (!isStr(raw.roman) || !(raw.roman as string).includes('___') || !answerOk(raw.options)) {
        issues.add(p, 'fill needs roman with ___, options and valid answer');
        return null;
      }
      break;
    case 'complete':
      if (!Array.isArray(raw.context) || !answerOk(raw.options)) {
        issues.add(p, 'complete needs context and options with valid answer');
        return null;
      }
      for (const [i, o] of (raw.options as unknown[]).entries()) {
        if (!isObj(o) || !checkForms(o, `${p}.options[${i}]`, issues)) return null;
      }
      break;
    case 'order':
      if (!isStr(raw.roman) || (raw.roman as string).trim().split(/\s+/).length < 2 || !isStr(raw.en)) {
        issues.add(p, 'order needs a multi-word roman sentence and en');
        return null;
      }
      break;
    case 'spokenQA':
      if (!isStr(raw.questionId)) {
        issues.add(p, 'spokenQA needs questionId');
        return null;
      }
      break;
    case 'readAloud':
      if (!isStr(raw.passageId)) {
        issues.add(p, 'readAloud needs passageId');
        return null;
      }
      break;
    default:
      issues.add(p, `unknown exercise type "${String(raw.type)}"`);
      return null;
  }
  return raw as unknown as AuthoredExercise;
}

export function validateLesson(raw: unknown, path: string, issues: Issues): Lesson | null {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.title) || !isStr(raw.objective)) {
    issues.add(path, 'lesson needs id, title and objective');
    return null;
  }
  const p = `${path}(${raw.id})`;
  if (!Array.isArray(raw.phrases) || raw.phrases.length === 0) {
    issues.add(p, 'lesson needs at least one phrase');
    return null;
  }
  const phrases = raw.phrases
    .map((ph, i) => validatePhrase(ph, `${p}.phrases[${i}]`, issues))
    .filter((x): x is Phrase => x !== null);
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises
        .map((ex, i) => validateExercise(ex, `${p}.exercises[${i}]`, issues))
        .filter((x): x is AuthoredExercise => x !== null)
    : [];
  if (phrases.length === 0) return null;
  return { ...(raw as unknown as Lesson), phrases, exercises };
}

export function validateUnit(raw: unknown, path: string, issues: Issues): Unit | null {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.title) || !Number.isInteger(raw.level)) {
    issues.add(path, 'unit needs id, title and level');
    return null;
  }
  if (!Array.isArray(raw.lessons)) {
    issues.add(path, 'unit needs lessons');
    return null;
  }
  const lessons = raw.lessons
    .map((l, i) => validateLesson(l, `${path}.lessons[${i}]`, issues))
    .filter((x): x is Lesson => x !== null);
  return { ...(raw as unknown as Unit), lessons };
}

export function validateCourseIndex(raw: unknown, issues: Issues): CourseIndex | null {
  if (!isObj(raw) || !Array.isArray(raw.levels) || !Array.isArray(raw.units) || !isObj(raw.extras)) {
    issues.add('course.json', 'needs levels, units and extras');
    return null;
  }
  return raw as unknown as CourseIndex;
}

export function validateConversations(raw: unknown, issues: Issues): ConversationScenario[] {
  if (!Array.isArray(raw)) {
    issues.add('conversations', 'must be an array');
    return [];
  }
  const out: ConversationScenario[] = [];
  for (const [i, c] of raw.entries()) {
    const p = `conversations[${i}]`;
    if (!isObj(c) || !isStr(c.id) || !isStr(c.start) || !Array.isArray(c.nodes)) {
      issues.add(p, 'scenario needs id, start and nodes');
      continue;
    }
    const ids = new Set(c.nodes.filter(isObj).map((n) => n.id));
    let ok = ids.has(c.start);
    if (!ok) issues.add(`${p}(${c.id})`, `start node "${c.start}" missing`);
    for (const n of c.nodes) {
      if (!isObj(n) || !isObj(n.line) || !checkForms(n.line, `${p}(${c.id}).${String(n.id)}`, issues)) {
        ok = false;
        continue;
      }
      if (!n.end && (!Array.isArray(n.choices) || n.choices.length === 0)) {
        issues.add(`${p}(${c.id}).${n.id}`, 'non-ending node needs choices');
        ok = false;
      }
      for (const ch of (n.choices as unknown[]) ?? []) {
        if (!isObj(ch) || !checkForms(ch, `${p}(${c.id}).${n.id}.choice`, issues)) {
          ok = false;
          continue;
        }
        if (ch.quality !== 'wrong' && !(isStr(ch.next) && ids.has(ch.next))) {
          issues.add(`${p}(${c.id}).${n.id}`, `choice "${ch.roman}" points to missing node "${String(ch.next)}"`);
          ok = false;
        }
      }
      if (Array.isArray(n.choices) && !n.choices.some((ch) => isObj(ch) && ch.quality !== 'wrong')) {
        issues.add(`${p}(${c.id}).${n.id}`, 'node has no way forward');
        ok = false;
      }
    }
    if (ok) out.push(c as unknown as ConversationScenario);
  }
  return out;
}

export function validatePronunciation(raw: unknown, issues: Issues): PronunciationDrill[] {
  if (!Array.isArray(raw)) {
    issues.add('pronunciation', 'must be an array');
    return [];
  }
  return raw.filter((d, i): d is PronunciationDrill => {
    const p = `pronunciation[${i}]`;
    if (!isObj(d) || !isStr(d.id) || !isStr(d.title) || !isStr(d.tip) || !Array.isArray(d.items)) {
      issues.add(p, 'drill needs id, title, tip and items');
      return false;
    }
    return d.items.every((it, j) => isObj(it) && checkForms(it, `${p}.items[${j}]`, issues));
  });
}

export function validateSpeaking(raw: unknown, issues: Issues): SpeakingContent {
  const empty: SpeakingContent = { questions: [], passages: [], dailyThemes: [] };
  if (!isObj(raw)) {
    issues.add('speaking', 'must be an object');
    return empty;
  }
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).filter((q, i) => {
    const p = `speaking.questions[${i}]`;
    if (!isObj(q) || !isStr(q.id) || !isObj(q.question) || !Array.isArray(q.answers) || q.answers.length === 0) {
      issues.add(p, 'question needs id, question and answers');
      return false;
    }
    return checkForms(q.question, p, issues) && q.answers.every((a, j) => isObj(a) && checkForms(a, `${p}.answers[${j}]`, issues));
  });
  const passages = (Array.isArray(raw.passages) ? raw.passages : []).filter((ps, i) => {
    const p = `speaking.passages[${i}]`;
    if (!isObj(ps) || !isStr(ps.id) || !Array.isArray(ps.lines) || ps.lines.length === 0) {
      issues.add(p, 'passage needs id and lines');
      return false;
    }
    return ps.lines.every((l, j) => isObj(l) && checkForms(l, `${p}.lines[${j}]`, issues));
  });
  const dailyThemes = Array.isArray(raw.dailyThemes) ? raw.dailyThemes.filter((t) => isObj(t) && Array.isArray(t.phraseIds)) : [];
  return { questions, passages, dailyThemes } as SpeakingContent;
}

/** Cross-file checks: unique ids and references between lessons, questions, passages and scenarios. */
export function crossValidate(
  units: Unit[],
  conversations: ConversationScenario[],
  speaking: SpeakingContent,
  issues: Issues,
): void {
  const phraseIds = new Set<string>();
  const lessonIds = new Set<string>();
  const exerciseIds = new Set<string>();
  const qIds = new Set(speaking.questions.map((q) => q.id));
  const pIds = new Set(speaking.passages.map((p) => p.id));
  const cIds = new Set(conversations.map((c) => c.id));
  for (const u of units) {
    for (const l of u.lessons) {
      if (lessonIds.has(l.id)) issues.add(l.id, 'duplicate lesson id');
      lessonIds.add(l.id);
      for (const ph of l.phrases) {
        if (phraseIds.has(ph.id)) issues.add(`${l.id}.${ph.id}`, 'duplicate phrase id');
        phraseIds.add(ph.id);
      }
      for (const ex of l.exercises ?? []) {
        if (exerciseIds.has(ex.id)) issues.add(`${l.id}.${ex.id}`, 'duplicate exercise id');
        exerciseIds.add(ex.id);
        if (ex.type === 'spokenQA' && !qIds.has(ex.questionId)) issues.add(`${l.id}.${ex.id}`, `unknown question ${ex.questionId}`);
        if (ex.type === 'readAloud' && !pIds.has(ex.passageId)) issues.add(`${l.id}.${ex.id}`, `unknown passage ${ex.passageId}`);
      }
      if (l.roleplayId && !cIds.has(l.roleplayId)) issues.add(l.id, `unknown roleplay ${l.roleplayId}`);
    }
  }
  for (const t of speaking.dailyThemes) {
    for (const id of t.phraseIds) if (!phraseIds.has(id)) issues.add(`dailyThemes.${t.id}`, `unknown phrase ${id}`);
  }
}
