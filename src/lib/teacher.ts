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
    case 'tip':
      return "Let me explain how this part of Urdu works — it'll make the next phrases much easier.";
    case 'pattern':
      return "Here's the key idea of this lesson. Once you get this pattern, you can make lots of sentences with the words you know.";
    case 'say': {
      if (ex.id.includes(':warm:')) return "Warm-up from last time: how would you say this? Say it out loud first, then check.";
      if (ex.id.includes(':recall:') || ex.id.includes(':final:')) return "Do you still remember this one from earlier? Say it first, then check.";
      return "Your turn to build it. Say it out loud in Urdu — then tap to check. Mistakes are how you learn!";
    }
  }
}

// Urdu text must match PRAISE in scripts/gen_audio.py so each character can say it out loud.
const PRAISE = [
  { roman: 'Shabash!', urdu: 'شاباش!', en: 'Well done!' },
  { roman: 'Bohat acha!', urdu: 'بہت اچھا!', en: 'Very good!' },
  { roman: 'Zabardast!', urdu: 'زبردست!', en: 'Awesome!' },
  { roman: 'Kamaal!', urdu: 'کمال!', en: 'Amazing!' },
  { roman: 'Bilkul theek!', urdu: 'بالکل ٹھیک!', en: 'Exactly right!' },
];
export const ENCOURAGE = { roman: 'Koi baat nahi, phir koshish karein!', urdu: 'کوئی بات نہیں، پھر کوشش کریں!', en: 'No problem — try again!' };
export const FINALE = { roman: 'Shabash! Aap ne kamaal kar diya!', urdu: 'شاباش! آپ نے کمال کر دیا!', en: 'Well done! You were amazing!' };

export function praise(seed: number) {
  return PRAISE[Math.abs(seed) % PRAISE.length];
}
