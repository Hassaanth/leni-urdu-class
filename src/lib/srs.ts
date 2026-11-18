// Explainable spaced repetition (a Leitner-style box system).
// Each correct recall moves a card up one box (longer interval); a mistake moves it down two.
// Only confirmed language results are graded here — speech-recognition failures never are.
import { addDays, diffDays, type DateKey } from './dates';

/** Days until the next review for each box. Box 0 = new / just missed. */
export const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60] as const;
export const MAX_BOX = INTERVALS.length - 1;

export interface SrsCard {
  id: string;
  introducedOn: DateKey;
  box: number;
  correct: number;
  incorrect: number;
  /** Consecutive correct answers. */
  streak: number;
  lastReviewed?: DateKey;
  lastResult?: 'correct' | 'incorrect';
  due: DateKey;
  /** Last 6 results, newest last ("c" correct, "x" incorrect). */
  recent: ('c' | 'x')[];
}

export type Mastery = 'new' | 'learning' | 'familiar' | 'strong' | 'mastered';

export function newCard(id: string, today: DateKey): SrsCard {
  return { id, introducedOn: today, box: 0, correct: 0, incorrect: 0, streak: 0, due: today, recent: [] };
}

export function grade(card: SrsCard, correct: boolean, today: DateKey): SrsCard {
  const recent = [...card.recent, correct ? 'c' : 'x'].slice(-6) as SrsCard['recent'];
  if (!correct) {
    const box = Math.max(0, card.box - 2);
    return {
      ...card,
      box,
      incorrect: card.incorrect + 1,
      streak: 0,
      lastReviewed: today,
      lastResult: 'incorrect',
      due: today,
      recent,
    };
  }
  // Correct. Only move up one box per day, so drilling a phrase five times in one
  // lesson doesn't push its next review weeks away.
  const alreadyAdvancedToday = card.lastReviewed === today && card.lastResult === 'correct';
  const missedToday = card.lastReviewed === today && card.lastResult === 'incorrect';
  let box = card.box;
  let due = card.due;
  if (!alreadyAdvancedToday) {
    box = missedToday ? Math.max(1, card.box) : Math.min(MAX_BOX, card.box + 1);
    due = addDays(today, Math.max(1, INTERVALS[box]));
  }
  return {
    ...card,
    box,
    correct: card.correct + 1,
    streak: card.streak + 1,
    lastReviewed: today,
    lastResult: 'correct',
    due,
    recent,
  };
}

export function mastery(card: SrsCard | undefined): Mastery {
  if (!card || (card.correct === 0 && card.box === 0)) return 'new';
  if (card.box <= 2) return 'learning';
  if (card.box <= 4) return 'familiar';
  if (card.box < MAX_BOX) return 'strong';
  return 'mastered';
}

export const MASTERY_LABEL: Record<Mastery, string> = {
  new: 'New',
  learning: 'Learning',
  familiar: 'Familiar',
  strong: 'Strong',
  mastered: 'Mastered',
};

export function isDue(card: SrsCard, today: DateKey): boolean {
  return diffDays(card.due, today) >= 0;
}

export function recentMistakes(card: SrsCard): number {
  return card.recent.filter((r) => r === 'x').length;
}

/** Due cards, hardest first: recent mistakes, then most overdue, then lowest box. */
export function dueQueue(cards: SrsCard[], today: DateKey): SrsCard[] {
  return cards
    .filter((c) => isDue(c, today))
    .sort(
      (a, b) =>
        recentMistakes(b) - recentMistakes(a) ||
        diffDays(b.due, today) - diffDays(a.due, today) ||
        a.box - b.box,
    );
}

/** The cards a learner struggles with most (for "areas to improve"). */
export function weakest(cards: SrsCard[], n: number): SrsCard[] {
  return cards
    .filter((c) => c.incorrect > 0)
    .sort((a, b) => recentMistakes(b) - recentMistakes(a) || b.incorrect / (b.correct + b.incorrect) - a.incorrect / (a.correct + a.incorrect))
    .slice(0, n);
}

/** A plain-English explanation of why a card is scheduled when it is. */
export function explain(card: SrsCard, today: DateKey): string {
  const days = diffDays(today, card.due);
  const when = days <= 0 ? 'due now' : days === 1 ? 'due tomorrow' : `due in ${days} days`;
  if (card.lastResult === 'incorrect') return `You missed this last time, so it's ${when} for another try.`;
  if (card.correct === 0) return `New word — ${when}.`;
  if (card.streak >= 2) return `Correct ${card.streak} times in a row, so the gap grows: ${when}.`;
  return `Recalled correctly last time — ${when}.`;
}
