// Loads curriculum JSON from /content at runtime and builds lookup indexes.
import type { Character, Course, Lesson, Phrase, Unit } from '../types';
import {
  Issues,
  crossValidate,
  validateConversations,
  validateCourseIndex,
  validatePronunciation,
  validateSpeaking,
  validateUnit,
} from './validate';

export type JsonFetcher = (path: string) => Promise<unknown>;

const defaultFetcher =
  (base: string): JsonFetcher =>
  async (path) => {
    const res = await fetch(base + path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  };

export interface LoadedCourse {
  course: Course;
  issues: string[];
}

export async function loadCourse(fetcher: JsonFetcher = defaultFetcher('./content/')): Promise<LoadedCourse> {
  const issues = new Issues();
  const index = validateCourseIndex(await fetcher('course.json'), issues);
  if (!index) throw new Error('Course index is invalid: ' + issues.list.join('; '));

  const units: Unit[] = [];
  const unitResults = await Promise.allSettled(index.units.map((u) => fetcher(u.file)));
  unitResults.forEach((r, i) => {
    const file = index.units[i].file;
    if (r.status === 'rejected') {
      issues.add(file, `could not load (${String(r.reason)})`);
      return;
    }
    const unit = validateUnit(r.value, file, issues);
    if (unit) units.push(unit);
  });

  const [conv, pron, speak, chars] = await Promise.allSettled([
    fetcher(index.extras.conversations),
    fetcher(index.extras.pronunciation),
    fetcher(index.extras.speaking),
    index.extras.characters ? fetcher(index.extras.characters) : Promise.resolve([]),
  ]);
  const characters = (chars.status === 'fulfilled' && Array.isArray(chars.value) ? chars.value : []).filter(
    (c): c is Character => !!c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.avatar === 'string',
  );
  const conversations = conv.status === 'fulfilled' ? validateConversations(conv.value, issues) : [];
  const pronunciation = pron.status === 'fulfilled' ? validatePronunciation(pron.value, issues) : [];
  const speaking =
    speak.status === 'fulfilled' ? validateSpeaking(speak.value, issues) : { questions: [], passages: [], dailyThemes: [] };
  if (conv.status === 'rejected') issues.add('conversations', 'could not load');
  if (pron.status === 'rejected') issues.add('pronunciation', 'could not load');
  if (speak.status === 'rejected') issues.add('speaking', 'could not load');

  crossValidate(units, conversations, speaking, issues);
  units.sort((a, b) => a.level - b.level || index.units.findIndex((u) => u.id === a.id) - index.units.findIndex((u) => u.id === b.id));

  return {
    course: { levels: index.levels, units, conversations, pronunciation, speaking, characters, story: index.story },
    issues: issues.list,
  };
}

export interface CourseIndexes {
  lessons: Lesson[];
  lessonById: Map<string, Lesson>;
  unitByLesson: Map<string, Unit>;
  phraseById: Map<string, Phrase>;
  lessonByPhrase: Map<string, Lesson>;
  allPhrases: Phrase[];
  /** Sentences learners build in Building Blocks lessons (reviewed by saying them, not picking). */
  buildIds: Set<string>;
}

export function buildIndexes(course: Course): CourseIndexes {
  const lessons: Lesson[] = [];
  const lessonById = new Map<string, Lesson>();
  const unitByLesson = new Map<string, Unit>();
  const phraseById = new Map<string, Phrase>();
  const lessonByPhrase = new Map<string, Lesson>();
  const buildIds = new Set<string>();
  for (const u of course.units) {
    for (const l of u.lessons) {
      lessons.push(l);
      lessonById.set(l.id, l);
      unitByLesson.set(l.id, u);
      for (const p of [...l.phrases, ...(l.builds ?? [])]) {
        phraseById.set(p.id, p);
        lessonByPhrase.set(p.id, l);
      }
      for (const b of l.builds ?? []) buildIds.add(b.id);
    }
  }
  return { lessons, lessonById, unitByLesson, phraseById, lessonByPhrase, allPhrases: [...phraseById.values()], buildIds };
}
