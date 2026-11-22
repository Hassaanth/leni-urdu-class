import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndexes, loadCourse } from '../src/content/loader';
import { choiceForTarget, getNode, reply, startConversation } from '../src/lib/conversation';
import { buildLessonExercises, buildReviewExercises, isGraded } from '../src/lib/exercises';
import {
  completeLesson,
  goalProgress,
  initialState,
  markDailyChallenge,
  migrate,
  practiceStreak,
  recordAnswer,
  recordSpeaking,
  speakingStreak,
  XP,
} from '../src/lib/progress';
import { createStore, memoryAdapter } from '../src/state/store';

const today = '2026-10-23';

describe('progress updates', () => {
  it('awards XP for correct answers and grades review cards', () => {
    let s = initialState();
    s = recordAnswer(s, { phraseIds: ['p1'], correct: true, firstTry: true }, today);
    expect(s.xp).toBe(XP.correctFirstTry);
    expect(s.cards.p1.correct).toBe(1);
    s = recordAnswer(s, { phraseIds: ['p1'], correct: false, firstTry: true }, today);
    expect(s.xp).toBe(XP.correctFirstTry);
    expect(s.cards.p1.incorrect).toBe(1);
    expect(s.days[today].exercises).toBe(2);
  });

  it('records lesson completion with bonus XP, less for repeats', () => {
    let s = initialState();
    const first = completeLesson(s, 'l1', 1, today);
    s = first.state;
    expect(first.xpEarned).toBe(XP.lessonComplete + XP.perfectLesson);
    const again = completeLesson(s, 'l1', 0.5, today);
    expect(again.xpEarned).toBeLessThan(first.xpEarned);
    expect(again.state.lessons.l1.times).toBe(2);
    expect(again.state.lessons.l1.bestAccuracy).toBe(1);
  });

  it('rewards genuine speaking attempts, caps repeats, and never penalises recognition errors', () => {
    let s = initialState();
    const before = s.cards;
    const r1 = recordSpeaking(s, { key: 'p1', label: 'x', outcome: 'different', usedRecognition: true }, today);
    expect(r1.xpEarned).toBe(XP.speakAttempt);
    s = r1.state;
    const r2 = recordSpeaking(s, { key: 'p1', label: 'x', outcome: 'match', usedRecognition: true }, today);
    expect(r2.xpEarned).toBe(XP.speakAttempt + XP.speakRecognizedBonus);
    s = r2.state;
    const err = recordSpeaking(s, { key: 'p1', label: 'x', outcome: 'error', usedRecognition: true }, today);
    expect(err.xpEarned).toBe(0);
    expect(err.state.speaking.recognitionErrors).toBe(1);
    expect(err.state.speaking.byPhrase.p1.attempts).toBe(2); // technical errors aren't attempts
    expect(err.state.cards).toBe(before); // mastery untouched by speech results
    s = err.state;
    for (let i = 0; i < 10; i++) s = recordSpeaking(s, { key: 'p1', label: 'x', outcome: 'practiced', usedRecognition: false }, today).state;
    const total = s.days[today].xp;
    expect(total).toBeLessThanOrEqual(XP.speakDailyCapPerPhrase * (XP.speakAttempt + XP.speakRecognizedBonus));
    expect(s.speaking.recognitionAttempts).toBe(2);
    expect(s.speaking.recognitionMatches).toBe(1);
  });

  it('does not store transcripts unless the learner opts in', () => {
    const s = recordSpeaking(initialState(), { key: 'p', label: 'x', outcome: 'match', transcript: 'آپ', usedRecognition: true }, today).state;
    expect(s.speaking.log[0].transcript).toBeUndefined();
    const opted = initialState();
    opted.settings.keepTranscripts = true;
    expect(recordSpeaking(opted, { key: 'p', label: 'x', outcome: 'match', transcript: 'آپ', usedRecognition: true }, today).state.speaking.log[0].transcript).toBe('آپ');
  });

  it('computes practice and speaking streaks from day stats', () => {
    let s = initialState();
    s = recordAnswer(s, { phraseIds: [], correct: true, firstTry: true }, '2026-10-21');
    s = recordAnswer(s, { phraseIds: [], correct: true, firstTry: true }, '2026-10-22');
    s = recordSpeaking(s, { key: 'p', label: 'x', outcome: 'practiced', usedRecognition: false }, '2026-10-22').state;
    s = recordAnswer(s, { phraseIds: [], correct: true, firstTry: true }, today);
    expect(practiceStreak(s, today)).toBe(3);
    expect(speakingStreak(s, today)).toBe(1); // spoke yesterday only
  });

  it('tracks daily goal minutes and the daily challenge', () => {
    let s = initialState();
    s.settings.dailyGoalMinutes = 5;
    s = { ...s, days: { [today]: { xp: 0, seconds: 320, exercises: 0, correct: 0, lessons: 0, reviews: 0, speakingAttempts: 0, spoken: [] } } };
    expect(goalProgress(s, today)).toEqual({ minutes: 5, goal: 5, done: true });
    for (let i = 0; i < 5; i++) s = markDailyChallenge(s, `p${i}`, today, 5).state;
    expect(s.dailyChallenge[today]).toHaveLength(5);
    const xpAfter = s.xp;
    s = markDailyChallenge(s, 'p0', today, 5).state; // repeat doesn't double-award
    expect(s.xp).toBe(xpAfter);
    expect(xpAfter).toBe(XP.dailyChallenge);
  });
});

describe('persistence', () => {
  it('survives a reload (new store instance on the same storage)', () => {
    const adapter = memoryAdapter();
    const a = createStore(adapter);
    a.update((s) => recordAnswer(s, { phraseIds: ['p1'], correct: true, firstTry: true }, today));
    a.update((s) => ({ ...s, settings: { ...s.settings, learnerName: 'Sara' } }));
    const b = createStore(adapter); // "refresh"
    expect(b.getState().xp).toBe(XP.correctFirstTry);
    expect(b.getState().settings.learnerName).toBe('Sara');
    expect(b.getState().cards.p1.correct).toBe(1);
  });

  it('recovers from corrupted or old data', () => {
    expect(createStore(memoryAdapter('{not json')).getState().xp).toBe(0);
    const migrated = migrate({ version: 1, xp: 50, settings: { showUrdu: false } });
    expect(migrated.xp).toBe(50);
    expect(migrated.settings.showUrdu).toBe(false);
    expect(migrated.settings.showRoman).toBe(true); // new default filled in
    expect(migrate({ version: 99 }).xp).toBe(0);
  });

  it('reset clears everything', () => {
    const adapter = memoryAdapter();
    const st = createStore(adapter);
    st.update((s) => ({ ...s, xp: 99 }));
    st.reset();
    expect(st.getState().xp).toBe(0);
    expect(createStore(adapter).getState().xp).toBe(0);
  });

  it('unlocks achievements when context is set', () => {
    const st = createStore(memoryAdapter());
    st.setAchievementContext({ unitLessonIds: [['l1']], conversationCount: 1 });
    st.update((s) => completeLesson(s, 'l1', 1, today).state);
    const ach = st.getState().achievements;
    expect(ach['first-lesson']).toBeDefined();
    expect(ach['unit-1']).toBeDefined();
    expect(ach.perfect).toBeDefined();
  });
});

describe('lesson engine and conversations over the real course', async () => {
  const base = join(__dirname, '..', 'public', 'content');
  const { course } = await loadCourse(async (p) => JSON.parse(readFileSync(join(base, p), 'utf8')));
  const idx = buildIndexes(course);

  it('builds valid exercises for every lesson', () => {
    for (const lesson of idx.lessons) {
      for (const gender of ['masculine', 'feminine'] as const) {
        const ex = buildLessonExercises(lesson, course, idx, { gender, name: 'Sara', seed: 42 });
        expect(ex.length, lesson.id).toBeGreaterThan(lesson.phrases.length);
        expect(ex.filter(isGraded).length, lesson.id).toBeGreaterThanOrEqual(5);
        expect(ex.some((e) => e.kind === 'repeat'), lesson.id).toBe(true);
        for (const e of ex) {
          if (e.kind === 'mcq' || e.kind === 'listen' || e.kind === 'fill' || e.kind === 'complete') {
            expect(e.answer, e.id).toBeGreaterThanOrEqual(0);
            expect(e.answer, e.id).toBeLessThan(e.options.length);
            expect(new Set(e.options.map((o) => (typeof o === 'string' ? o : 'label' in o ? o.label : o.roman))).size, `${e.id} has duplicate options`).toBe(
              e.options.length,
            );
          }
          if (e.kind === 'order') {
            const sortedTokens = [...e.tokens].sort();
            for (const w of e.answer) expect(sortedTokens, e.id).toContain(w);
          }
          if (e.kind === 'match') expect(new Set(e.pairs.map((p) => p.roman)).size).toBe(e.pairs.length);
        }
      }
    }
  });

  it('the sample lesson includes every required activity', () => {
    const lesson = idx.lessonById.get('l1-intro')!;
    const kinds = new Set(buildLessonExercises(lesson, course, idx, { gender: 'masculine', name: 'Ali', seed: 1 }).map((e) => e.kind));
    for (const k of ['intro', 'match', 'listen', 'order', 'complete', 'repeat', 'spokenQA', 'readAloud', 'translate']) expect(kinds.has(k as never), k).toBe(true);
  });

  it('builds review sessions', () => {
    const phrases = idx.allPhrases.slice(0, 10);
    expect(buildReviewExercises(phrases, idx, { gender: 'masculine', name: 'Ali', seed: 3 })).toHaveLength(10);
    expect(buildReviewExercises(phrases, idx, { gender: 'masculine', name: 'Ali', seed: 3, mode: 'flashcards' }).every((e) => e.kind === 'flashcard')).toBe(true);
  });

  it('every conversation can be completed by following natural replies', () => {
    for (const sc of course.conversations) {
      let st = startConversation(sc);
      let steps = 0;
      while (!st.ended && steps < 30) {
        const node = getNode(sc, st.nodeId);
        const best = node.choices!.find((c) => c.quality === 'best')!;
        st = reply(sc, st, best).state;
        steps++;
      }
      expect(st.ended, sc.id).toBe(true);
    }
  });

  it('wrong replies give feedback without advancing; spoken targets map back to choices', () => {
    const sc = course.conversations.find((c) => c.id === 'c-first-meeting')!;
    const st = startConversation(sc);
    const node = getNode(sc, st.nodeId);
    const wrong = node.choices!.find((c) => c.quality === 'wrong')!;
    const r = reply(sc, st, wrong);
    expect(r.advanced).toBe(false);
    expect(r.state.nodeId).toBe(st.nodeId);
    expect(r.state.wrong).toBe(1);
    expect(choiceForTarget(node, 'Wa alaikum assalam!')?.quality).toBe('best');
  });
});

describe('adaptive teaching flow', async () => {
  const base = join(__dirname, '..', 'public', 'content');
  const { course } = await loadCourse(async (p) => JSON.parse(readFileSync(join(base, p), 'utf8')));
  const idx = buildIndexes(course);
  const lesson = idx.lessonById.get('l1-intro')!;
  const kinds = (o: Parameters<typeof buildLessonExercises>[3]) => buildLessonExercises(lesson, course, idx, o).map((e) => e.kind);

  it('every lesson opens with its conversation and ends by speaking it', () => {
    for (const l of idx.lessons) {
      const ex = buildLessonExercises(l, course, idx, { gender: 'masculine', name: 'Ali', seed: 2 });
      const dialogues = ex.filter((e) => e.kind === 'dialogue') as Extract<(typeof ex)[number], { kind: 'dialogue' }>[];
      expect(dialogues.map((d) => d.mode), l.id).toEqual(['listen', 'speak']);
    }
  });

  it('gentle pace introduces two phrases at a time; fast pace four', () => {
    const firstStep = (k: string[]) => k.slice(k.indexOf('intro')).findIndex((x) => x !== 'intro');
    expect(firstStep(kinds({ gender: 'masculine', name: 'Ali', seed: 1, pace: 'relaxed', style: 'see' }))).toBe(2);
    expect(firstStep(kinds({ gender: 'masculine', name: 'Ali', seed: 1, pace: 'fast', style: 'see' }))).toBe(4);
  });

  it('speakers repeat each phrase straight after meeting it', () => {
    const k = kinds({ gender: 'masculine', name: 'Ali', seed: 1, style: 'speak' });
    k.forEach((x, i) => x === 'intro' && expect(k[i + 1]).toBe('repeat'));
  });

  it('listeners recognise by ear first; visual learners by reading', () => {
    const afterIntros = (k: string[]) => k[k.lastIndexOf('intro', 6) + 1];
    expect(afterIntros(kinds({ gender: 'masculine', name: 'Ali', seed: 1, style: 'listen' }))).toBe('listen');
    expect(afterIntros(kinds({ gender: 'masculine', name: 'Ali', seed: 1, style: 'see' }))).toBe('mcq');
  });

  it('gentle pace uses word banks instead of typing', () => {
    expect(kinds({ gender: 'masculine', name: 'Ali', seed: 1, pace: 'relaxed' })).not.toContain('translate');
  });

  it('starts with a warm-up of earlier phrases and adds practice for the weakest skill', () => {
    const warm = idx.lessonById.get('l2-numbers')!.phrases.slice(0, 3);
    const ex = buildLessonExercises(lesson, course, idx, { gender: 'masculine', name: 'Ali', seed: 1, warmup: warm, weakSkill: 'listening' });
    expect(ex.slice(0, 3).every((e) => e.id.includes(':warm:'))).toBe(true);
    expect(ex.filter((e) => e.id.includes('extra-listen')).length).toBeGreaterThan(0);
  });

  it('tracks skills and finds the weakest one', async () => {
    const { weakestSkill } = await import('../src/lib/progress');
    let s = initialState();
    for (let i = 0; i < 5; i++) s = recordAnswer(s, { phraseIds: [], correct: i === 0, firstTry: true, skill: 'listening' }, today);
    for (let i = 0; i < 5; i++) s = recordAnswer(s, { phraseIds: [], correct: true, firstTry: true, skill: 'reading' }, today);
    expect(s.skills.listening).toEqual({ right: 1, total: 5 });
    expect(weakestSkill(s)).toBe('listening');
  });
});

describe('Building Blocks engine', async () => {
  const base = join(__dirname, '..', 'public', 'content');
  const { course } = await loadCourse(async (f) => JSON.parse(readFileSync(join(base, f), 'utf8')));
  const idx = buildIndexes(course);
  const { buildPatternLesson } = await import('../src/lib/exercises');

  it('teaches every word before the pattern, and the pattern before building sentences', () => {
    for (const l of idx.lessons.filter((x) => x.kind === 'build')) {
      const ex = buildPatternLesson(l, idx, { gender: 'feminine', name: 'Sara', seed: 4 });
      const kinds = ex.map((e) => e.kind);
      const lastIntro = kinds.lastIndexOf('intro');
      const pattern = kinds.indexOf('pattern');
      const firstBuild = kinds.findIndex((k, i) => i > pattern && (k === 'order' || k === 'say'));
      expect(lastIntro, l.id).toBeLessThan(pattern);
      expect(pattern, l.id).toBeLessThan(firstBuild);
      // every sentence of the lesson is practised
      const practised = new Set(ex.flatMap((e) => ('phraseIds' in e ? e.phraseIds : [])));
      for (const b of l.builds!) expect(practised.has(b.id), `${l.id}:${b.id}`).toBe(true);
      // and some are recalled again later in the lesson
      expect(ex.some((e) => e.id.includes(':final:')), l.id).toBe(true);
    }
  });

  it('warms up with earlier sentences and uses tiles before free recall', () => {
    const b2 = idx.lessonById.get('b2')!;
    const prev = idx.lessonById.get('b1')!.builds!.slice(0, 3);
    const ex = buildPatternLesson(b2, idx, { gender: 'masculine', name: 'Ali', seed: 1, previousBuilds: prev });
    expect(ex.slice(0, 3).map((e) => e.kind)).toEqual(['say', 'say', 'say']);
    const afterPattern = ex.slice(ex.findIndex((e) => e.kind === 'pattern') + 1).filter((e) => e.kind === 'order' || e.kind === 'say');
    expect(afterPattern[0].kind).toBe('order');
  });
});
