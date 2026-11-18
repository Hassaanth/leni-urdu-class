// Learner progress model and pure update functions (no React, no storage — easy to test).
import { currentStreak, type DateKey } from './dates';
import { grade, newCard, type SrsCard } from './srs';

export interface Settings {
  showEnglish: boolean;
  showRoman: boolean;
  showUrdu: boolean;
  learnerName: string;
  /** Used to show the right verb endings (raha/rahi) first. Both forms are always accepted. */
  learnerGender: 'masculine' | 'feminine';
  dailyGoalMinutes: 5 | 10 | 15 | 20;
  speechRate: number;
  voiceURI: string | null;
  /** Consent for browser speech recognition, which may send audio to the browser vendor's service. */
  recognitionConsent: 'unset' | 'granted' | 'declined';
  recognitionLang: 'ur-PK' | 'ur-IN';
  /** Keep recognised text in practice history (text only, never audio). */
  keepTranscripts: boolean;
  textScale: 1 | 1.15 | 1.3;
  motion: 'system' | 'reduce';
  qaMode: 'beginner' | 'intermediate' | 'challenge';
  soundEffects: boolean;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  showEnglish: true,
  showRoman: true,
  showUrdu: true,
  learnerName: '',
  learnerGender: 'masculine',
  dailyGoalMinutes: 10,
  speechRate: 0.85,
  voiceURI: null,
  recognitionConsent: 'unset',
  recognitionLang: 'ur-PK',
  keepTranscripts: false,
  textScale: 1,
  motion: 'system',
  qaMode: 'beginner',
  soundEffects: true,
  onboarded: false,
};

export interface DayStats {
  xp: number;
  seconds: number;
  exercises: number;
  correct: number;
  lessons: number;
  reviews: number;
  speakingAttempts: number;
  /** Unique phrase keys spoken aloud today. */
  spoken: string[];
}

export type SpeechOutcome =
  | 'match' // recogniser heard the target
  | 'partial'
  | 'different'
  | 'empty' // nothing recognised
  | 'error' // technical failure (network, mic, permission)
  | 'self-good' // learner self-assessed: said it well
  | 'self-retry' // learner self-assessed: needs more practice
  | 'practiced'; // spoke / recorded without any assessment

export interface SpeakingLogEntry {
  at: string; // ISO time
  key: string; // phrase key (id or roman text)
  label: string; // roman text, for display
  outcome: SpeechOutcome;
  transcript?: string;
}

export interface PhraseSpeaking {
  label: string;
  attempts: number;
  recognized: number;
  days: DateKey[];
  lastOn: DateKey;
  /** Speaking attempts today, for XP caps. */
  todayCount: number;
}

export interface ProgressState {
  version: 1;
  settings: Settings;
  xp: number;
  lessons: Record<string, { completedOn: DateKey; bestAccuracy: number; times: number }>;
  days: Record<DateKey, DayStats>;
  cards: Record<string, SrsCard>;
  speaking: {
    byPhrase: Record<string, PhraseSpeaking>;
    sessions: number;
    recognitionAttempts: number;
    recognitionMatches: number;
    recognitionErrors: number;
    selfGood: number;
    selfRetry: number;
    log: SpeakingLogEntry[];
  };
  achievements: Record<string, DateKey>;
  conversations: Record<string, { completedOn: DateKey; times: number; bestChoices: number }>;
  dailyChallenge: Record<DateKey, string[]>;
}

export function initialState(): ProgressState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    xp: 0,
    lessons: {},
    days: {},
    cards: {},
    speaking: {
      byPhrase: {},
      sessions: 0,
      recognitionAttempts: 0,
      recognitionMatches: 0,
      recognitionErrors: 0,
      selfGood: 0,
      selfRetry: 0,
      log: [],
    },
    achievements: {},
    conversations: {},
    dailyChallenge: {},
  };
}

const emptyDay = (): DayStats => ({ xp: 0, seconds: 0, exercises: 0, correct: 0, lessons: 0, reviews: 0, speakingAttempts: 0, spoken: [] });

function withDay(s: ProgressState, today: DateKey, fn: (d: DayStats) => DayStats): ProgressState {
  return { ...s, days: { ...s.days, [today]: fn(s.days[today] ?? emptyDay()) } };
}

export const XP = {
  correctFirstTry: 10,
  correctRetry: 5,
  lessonComplete: 20,
  perfectLesson: 10,
  speakAttempt: 3,
  speakRecognizedBonus: 2,
  speakDailyCapPerPhrase: 5,
  review: 4,
  conversation: 25,
  dailyChallenge: 20,
} as const;

export function addXp(s: ProgressState, amount: number, today: DateKey): ProgressState {
  if (amount <= 0) return s;
  return withDay({ ...s, xp: s.xp + amount }, today, (d) => ({ ...d, xp: d.xp + amount }));
}

/** Record a graded (confirmed) answer for one or more phrases. */
export function recordAnswer(
  s: ProgressState,
  opts: { phraseIds: string[]; correct: boolean; firstTry: boolean; review?: boolean },
  today: DateKey,
): ProgressState {
  const cards = { ...s.cards };
  for (const id of opts.phraseIds) cards[id] = grade(cards[id] ?? newCard(id, today), opts.correct, today);
  let next: ProgressState = { ...s, cards };
  next = withDay(next, today, (d) => ({
    ...d,
    exercises: d.exercises + 1,
    correct: d.correct + (opts.correct ? 1 : 0),
    reviews: d.reviews + (opts.review ? 1 : 0),
  }));
  if (opts.correct) next = addXp(next, opts.review ? XP.review : opts.firstTry ? XP.correctFirstTry : XP.correctRetry, today);
  return next;
}

/** Make sure phrases a learner has seen exist as review cards (due today). */
export function introducePhrases(s: ProgressState, ids: string[], today: DateKey): ProgressState {
  const missing = ids.filter((id) => !s.cards[id]);
  if (!missing.length) return s;
  const cards = { ...s.cards };
  for (const id of missing) cards[id] = newCard(id, today);
  return { ...s, cards };
}

export function completeLesson(s: ProgressState, lessonId: string, accuracy: number, today: DateKey): { state: ProgressState; xpEarned: number } {
  const prev = s.lessons[lessonId];
  const first = !prev;
  let earned = first ? XP.lessonComplete : Math.round(XP.lessonComplete / 2);
  if (accuracy >= 1) earned += XP.perfectLesson;
  let next: ProgressState = {
    ...s,
    lessons: {
      ...s.lessons,
      [lessonId]: { completedOn: today, bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy), times: (prev?.times ?? 0) + 1 },
    },
  };
  next = withDay(next, today, (d) => ({ ...d, lessons: d.lessons + 1 }));
  next = addXp(next, earned, today);
  return { state: next, xpEarned: earned };
}

/**
 * Record a speaking attempt. Rewards genuine attempts (capped per phrase per day) — never requires
 * a perfect transcription. Recognition problems are counted separately and never touch mastery.
 */
export function recordSpeaking(
  s: ProgressState,
  attempt: { key: string; label: string; outcome: SpeechOutcome; transcript?: string; usedRecognition: boolean; /** A self-rating of an attempt already logged. */ ratingOnly?: boolean },
  today: DateKey,
  now: Date = new Date(),
): { state: ProgressState; xpEarned: number } {
  const prev = s.speaking.byPhrase[attempt.key];
  if (attempt.ratingOnly) {
    const sp = s.speaking;
    return {
      state: {
        ...s,
        speaking: { ...sp, selfGood: sp.selfGood + (attempt.outcome === 'self-good' ? 1 : 0), selfRetry: sp.selfRetry + (attempt.outcome === 'self-retry' ? 1 : 0) },
      },
      xpEarned: 0,
    };
  }
  const isTechnical = attempt.outcome === 'error';
  const countedBefore = prev && prev.lastOn === today ? prev.todayCount : 0;
  const todayCount = countedBefore + (isTechnical ? 0 : 1);
  const recognized = attempt.outcome === 'match';
  const byPhrase: PhraseSpeaking = {
    label: attempt.label,
    attempts: (prev?.attempts ?? 0) + (isTechnical ? 0 : 1),
    recognized: (prev?.recognized ?? 0) + (recognized ? 1 : 0),
    days: isTechnical ? (prev?.days ?? []) : [...new Set([...(prev?.days ?? []), today])].slice(-60),
    lastOn: today,
    todayCount,
  };
  const sp = s.speaking;
  const entry: SpeakingLogEntry = {
    at: now.toISOString(),
    key: attempt.key,
    label: attempt.label,
    outcome: attempt.outcome,
    transcript: s.settings.keepTranscripts ? attempt.transcript : undefined,
  };
  let next: ProgressState = {
    ...s,
    speaking: {
      ...sp,
      byPhrase: { ...sp.byPhrase, [attempt.key]: byPhrase },
      recognitionAttempts: sp.recognitionAttempts + (attempt.usedRecognition && !isTechnical ? 1 : 0),
      recognitionMatches: sp.recognitionMatches + (recognized ? 1 : 0),
      recognitionErrors: sp.recognitionErrors + (isTechnical ? 1 : 0),
      selfGood: sp.selfGood + (attempt.outcome === 'self-good' ? 1 : 0),
      selfRetry: sp.selfRetry + (attempt.outcome === 'self-retry' ? 1 : 0),
      log: [...sp.log, entry].slice(-300),
    },
  };
  if (isTechnical) return { state: next, xpEarned: 0 };
  next = withDay(next, today, (d) => ({
    ...d,
    speakingAttempts: d.speakingAttempts + 1,
    spoken: d.spoken.includes(attempt.key) ? d.spoken : [...d.spoken, attempt.key],
  }));
  let earned = 0;
  if (todayCount <= XP.speakDailyCapPerPhrase) earned = XP.speakAttempt + (recognized ? XP.speakRecognizedBonus : 0);
  next = addXp(next, earned, today);
  return { state: next, xpEarned: earned };
}

export function startSpeakingSession(s: ProgressState): ProgressState {
  return { ...s, speaking: { ...s.speaking, sessions: s.speaking.sessions + 1 } };
}

export function addPracticeTime(s: ProgressState, seconds: number, today: DateKey): ProgressState {
  if (seconds <= 0) return s;
  return withDay(s, today, (d) => ({ ...d, seconds: d.seconds + seconds }));
}

export function completeConversation(s: ProgressState, id: string, bestChoices: number, today: DateKey): { state: ProgressState; xpEarned: number } {
  const prev = s.conversations[id];
  const earned = prev ? Math.round(XP.conversation / 2) : XP.conversation;
  const next = {
    ...s,
    conversations: { ...s.conversations, [id]: { completedOn: today, times: (prev?.times ?? 0) + 1, bestChoices: Math.max(prev?.bestChoices ?? 0, bestChoices) } },
  };
  return { state: addXp(next, earned, today), xpEarned: earned };
}

export function markDailyChallenge(s: ProgressState, phraseKey: string, today: DateKey, total: number): { state: ProgressState; finished: boolean } {
  const done = s.dailyChallenge[today] ?? [];
  if (done.includes(phraseKey)) return { state: s, finished: done.length >= total };
  const list = [...done, phraseKey];
  let next: ProgressState = { ...s, dailyChallenge: { ...s.dailyChallenge, [today]: list } };
  const finished = list.length >= total;
  if (finished && done.length < total) next = addXp(next, XP.dailyChallenge, today);
  return { state: next, finished };
}

// ---------- Derived stats ----------

export function isActiveDay(d: DayStats | undefined): boolean {
  return !!d && (d.xp > 0 || d.speakingAttempts > 0 || d.seconds >= 60);
}

export function practiceStreak(s: ProgressState, today: DateKey): number {
  return currentStreak(
    Object.entries(s.days)
      .filter(([, d]) => isActiveDay(d))
      .map(([k]) => k),
    today,
  );
}

export function speakingStreak(s: ProgressState, today: DateKey): number {
  return currentStreak(
    Object.entries(s.days)
      .filter(([, d]) => d.speakingAttempts > 0)
      .map(([k]) => k),
    today,
  );
}

export function goalProgress(s: ProgressState, today: DateKey): { minutes: number; goal: number; done: boolean } {
  const d = s.days[today];
  const minutes = Math.floor((d?.seconds ?? 0) / 60);
  return { minutes, goal: s.settings.dailyGoalMinutes, done: minutes >= s.settings.dailyGoalMinutes };
}

/** Merge persisted data over defaults so older saves keep working when fields are added. */
export function migrate(raw: unknown): ProgressState {
  const base = initialState();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Partial<ProgressState>;
  if (r.version !== 1) return base;
  return {
    ...base,
    ...r,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    speaking: { ...base.speaking, ...(r.speaking ?? {}) },
  } as ProgressState;
}
