import type { DateKey } from './dates';
import { practiceStreak, speakingStreak, type ProgressState } from './progress';
import { mastery } from './srs';

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  test: (s: ProgressState, today: DateKey, ctx: { unitLessonIds: string[][]; conversationCount: number }) => boolean;
}

const spokenPhrases = (s: ProgressState) => Object.values(s.speaking.byPhrase).filter((p) => p.attempts > 0).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-lesson', icon: '🌱', title: 'First steps', description: 'Complete your first lesson.', test: (s) => Object.keys(s.lessons).length >= 1 },
  { id: 'first-words', icon: '🗣️', title: 'First words aloud', description: 'Practise a phrase out loud.', test: (s) => spokenPhrases(s) >= 1 },
  { id: 'speaker-10', icon: '🎙️', title: 'Finding your voice', description: 'Practise 10 different phrases aloud.', test: (s) => spokenPhrases(s) >= 10 },
  { id: 'speaker-50', icon: '📣', title: 'Confident speaker', description: 'Practise 50 different phrases aloud.', test: (s) => spokenPhrases(s) >= 50 },
  { id: 'streak-3', icon: '🔥', title: 'Three in a row', description: 'Practise on 3 days in a row.', test: (s, t) => practiceStreak(s, t) >= 3 },
  { id: 'streak-7', icon: '🏅', title: 'A full week', description: 'Practise on 7 days in a row.', test: (s, t) => practiceStreak(s, t) >= 7 },
  { id: 'speak-streak-3', icon: '🎤', title: 'Speaking habit', description: 'Speak Urdu aloud on 3 days in a row.', test: (s, t) => speakingStreak(s, t) >= 3 },
  {
    id: 'unit-1',
    icon: '🧩',
    title: 'Unit complete',
    description: 'Finish every lesson in a unit.',
    test: (s, _t, ctx) => ctx.unitLessonIds.some((ids) => ids.length > 0 && ids.every((id) => s.lessons[id])),
  },
  { id: 'perfect', icon: '💯', title: 'Flawless', description: 'Finish a lesson with every answer right first time.', test: (s) => Object.values(s.lessons).some((l) => l.bestAccuracy >= 1) },
  { id: 'words-25', icon: '📚', title: 'Word collector', description: 'Get 25 words or phrases to "Familiar" or better.', test: (s) => Object.values(s.cards).filter((c) => ['familiar', 'strong', 'mastered'].includes(mastery(c))).length >= 25 },
  { id: 'first-chat', icon: '💬', title: 'First conversation', description: 'Finish a role-play conversation.', test: (s) => Object.keys(s.conversations).length >= 1 },
  { id: 'chats-5', icon: '🤝', title: 'Social butterfly', description: 'Finish 5 different conversations.', test: (s) => Object.keys(s.conversations).length >= 5 },
  { id: 'reviewer', icon: '🔁', title: 'Steady reviewer', description: 'Complete 30 review answers.', test: (s) => Object.values(s.days).reduce((n, d) => n + d.reviews, 0) >= 30 },
  { id: 'daily-challenge', icon: '⭐', title: 'Daily challenger', description: 'Finish a Daily Speaking Challenge.', test: (s) => Object.values(s.dailyChallenge).some((l) => l.length >= 5) },
];

/** Returns ids newly unlocked (not already in state). */
export function newlyUnlocked(s: ProgressState, today: DateKey, ctx: { unitLessonIds: string[][]; conversationCount: number }): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !s.achievements[a.id] && a.test(s, today, ctx));
}
