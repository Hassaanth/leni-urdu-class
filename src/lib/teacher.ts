// What the teacher (Leni) says before each step — short, warm, and explains *why* we're doing it.
import type { Exercise } from './exercises';
import type { LearnStyle } from './progress';
import { fillSlots } from './text';

export const TEACHER = { name: 'Leni', avatar: '👩🏽‍🏫' };

export function teacherLine(ex: Exercise, style: LearnStyle, name: string, first: boolean): string {
  const warm = ex.id.includes(':warm:');
  if (warm) return 'Quick warm-up from last time — do you still remember this one?';
  switch (ex.kind) {
    case 'dialogue':
      return ex.mode === 'listen'
        ? `Before we start, listen to this short conversation. Don't worry if you don't understand it yet — by the end of this lesson, you will.`
        : `You've learned every line now. Let's have this conversation for real — ${ex.dialogue.partner.name} speaks, then it's your turn.`;
    case 'intro':
      if (first)
        return style === 'listen'
          ? `Here's your first new phrase. Listen to it first, then read it. Say it out loud with me.`
          : `Here's your first new phrase. Read it, listen, then say it out loud with me.`;
      return `Next: how to say "${fillSlots(ex.phrase.en, name)}". Listen, then repeat it out loud.`;
    case 'listen':
      return 'Listen carefully. What did you hear? Play it again as many times as you like.';
    case 'mcq':
      return ex.optionsAreRoman ? 'Which one is right? Say the answer out loud before you tap.' : 'What does this mean? Read it out loud first.';
    case 'match':
      return "Let's connect everything you've learned so far.";
    case 'order':
      return 'Now you build it. Tip: in Urdu the verb usually comes last.';
    case 'translate':
      return "Your turn to write it from memory. Don't worry about perfect spelling — I'll accept common ways of writing it.";
    case 'fill':
      return 'One word is missing. Which one fits?';
    case 'complete':
      return "Someone's talking to you. What would you say back?";
    case 'flashcard':
      return 'Try to say it before you flip the card.';
    case 'repeat':
      return "Now say it out loud. It doesn't have to be perfect — speaking is how it sticks.";
    case 'spokenQA':
      return "I'll ask you a question. Answer out loud, in Urdu.";
    case 'readAloud':
      return 'Read this out loud, line by line. Tap a line to practise it on its own.';
  }
}

const PRAISE = [
  { roman: 'Shabash!', en: 'Well done!' },
  { roman: 'Bohat acha!', en: 'Very good!' },
  { roman: 'Zabardast!', en: 'Awesome!' },
  { roman: 'Kamaal!', en: 'Amazing!' },
  { roman: 'Bilkul theek!', en: 'Exactly right!' },
];

export function praise(seed: number) {
  return PRAISE[Math.abs(seed) % PRAISE.length];
}
