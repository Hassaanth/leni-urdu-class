// Core data models for curriculum content, exercises, conversations and progress.
// Content lives in public/content/*.json and is validated at load time (src/content/validate.ts).

/** A single learnable item: word, phrase or sentence, shown in three forms. */
export interface Phrase {
  id: string;
  en: string;
  roman: string;
  urdu: string;
  /** Other acceptable Roman Urdu spellings or natural alternatives with the same meaning. */
  accept?: string[];
  /** Plain-English explanation: usage, politeness, grammar. */
  note?: string;
  /** Word-for-word gloss, e.g. "your name what is". */
  literal?: string;
  /**
   * Masculine/feminine forms. by = "speaker" when the form follows the speaker's gender
   * (main thak gaya/gayi hoon); "listener" when it follows the person addressed or described.
   */
  genderVariants?: { masculine: FormPair; feminine: FormPair; explain: string; by?: 'speaker' | 'listener' };
  /** Recorded audio file (relative to /content/audio). None are bundled yet. */
  audio?: string;
  /** Words like "{name}" are slots the learner fills in. */
  slot?: 'name';
  /** Optional: excluded from auto-generated word-order exercises etc. */
  kind?: 'word' | 'phrase' | 'sentence';
}

export interface FormPair {
  roman: string;
  urdu: string;
}

export interface DialogueLine {
  speaker: string;
  roman: string;
  urdu: string;
  en: string;
}

export interface ReadAloudPassage {
  id: string;
  title: string;
  level: number;
  lines: DialogueLine[] | PassageLine[];
  question?: { prompt: string; options: string[]; answer: number; explain: string };
}

export interface PassageLine {
  roman: string;
  urdu: string;
  en: string;
}

export interface SpokenQuestion {
  id: string;
  level: number;
  question: FormPair & { en: string };
  /** Acceptable answers. "{name}" matches any name. */
  answers: (FormPair & { en: string })[];
  hints?: string[];
}

/** Authored exercises (in addition to the ones the engine generates from phrases). */
export type AuthoredExercise =
  | {
      type: 'complete';
      id: string;
      context: DialogueLine[];
      prompt: string;
      options: (FormPair & { en: string })[];
      answer: number;
      explain: string;
    }
  | {
      type: 'fill';
      id: string;
      /** Roman sentence with "___" marking the gap. */
      roman: string;
      urdu: string;
      en: string;
      options: string[];
      answer: number;
      explain: string;
    }
  | {
      type: 'order';
      id: string;
      en: string;
      roman: string;
      urdu: string;
      distractors?: string[];
      explain?: string;
    }
  | {
      type: 'mcq';
      id: string;
      prompt: string;
      options: string[];
      answer: number;
      explain: string;
    }
  | { type: 'spokenQA'; id: string; questionId: string }
  | { type: 'readAloud'; id: string; passageId: string };

export interface DialogueTurn {
  who: 'them' | 'you';
  roman: string;
  urdu: string;
  en: string;
  /** Feminine-speaker version of a "you" line, when it differs. */
  f?: FormPair;
}

/** A short real conversation: heard at the start of a lesson, spoken by the learner at the end. */
export interface LessonDialogue {
  title: string;
  /** character = id in characters.json (decides voice and avatar). */
  partner: { name: string; character?: string };
  lines: DialogueTurn[];
}

/** A reusable sentence frame, e.g. "Mujhe ___ chahiye" = "I need ___". */
export interface SentencePattern {
  title: string;
  explain: string;
  frame: FormPair & { en: string };
  /** Word-for-word gloss of the frame, e.g. "to me ___ is needed". */
  literal?: string;
}

export interface Lesson {
  id: string;
  title: string;
  objective: string;
  /** Short plain-English explanations shown at the start. */
  tips?: string[];
  phrases: Phrase[];
  exercises?: AuthoredExercise[];
  /** Conversation scenario that practises this lesson. */
  roleplayId?: string;
  dialogue?: LessonDialogue;
  /** "build" lessons teach words + one sentence pattern, then have the learner build many sentences. */
  kind?: 'build';
  pattern?: SentencePattern;
  /** Sentences the learner builds from the lesson's words (and earlier ones). */
  builds?: Phrase[];
}

export interface GuideSection {
  title: string;
  body: string;
  /** Phrase ids used as examples (they already have audio). */
  examples: string[];
}

export interface Unit {
  id: string;
  level: number;
  title: string;
  description: string;
  lessons: Lesson[];
  /** Character who hosts this chapter of the story. */
  host?: string;
  chapter?: string;
  story?: string;
  /** Guidebook: how this unit's Urdu works, in plain English. */
  guide?: GuideSection[];
}

export interface Character {
  id: string;
  name: string;
  role: string;
  avatar: string;
  bio: string;
  aliases?: string[];
}

export interface Level {
  id: number;
  title: string;
  description: string;
  speakingGoal: string;
}

export interface CourseIndex {
  version: number;
  levels: Level[];
  units: { id: string; level: number; file: string }[];
  extras: { conversations: string; pronunciation: string; speaking: string; characters?: string };
  story?: { title: string; text: string };
}

// ---------- Conversations ----------

export interface ConversationChoice {
  roman: string;
  urdu: string;
  en: string;
  /** best = natural, ok = understandable but less natural, wrong = doesn't fit. */
  quality: 'best' | 'ok' | 'wrong';
  feedback: string;
  /** Node to go to. Required unless quality is "wrong" (wrong choices let the learner retry). */
  next?: string;
}

export interface ConversationNode {
  id: string;
  line: FormPair & { en: string };
  note?: string;
  newWords?: { roman: string; urdu: string; en: string }[];
  choices?: ConversationChoice[];
  /** If set, this node ends the conversation. */
  end?: string;
}

export interface ConversationScenario {
  id: string;
  level: number;
  title: string;
  emoji: string;
  context: string;
  goal: string;
  partner: { name: string; role: string; character?: string };
  start: string;
  nodes: ConversationNode[];
}

// ---------- Pronunciation ----------

export interface PronunciationItem {
  roman: string;
  urdu: string;
  en: string;
  /** Pronunciation guide using marked letters, e.g. "ṭamāṭar". */
  guide?: string;
}

export interface PronunciationDrill {
  id: string;
  title: string;
  focus: string;
  tip: string;
  items: PronunciationItem[];
}

export interface SpeakingContent {
  questions: SpokenQuestion[];
  passages: ReadAloudPassage[];
  dailyThemes: { id: string; title: string; phraseIds: string[] }[];
}

export interface Course {
  levels: Level[];
  units: Unit[];
  conversations: ConversationScenario[];
  pronunciation: PronunciationDrill[];
  speaking: SpeakingContent;
  characters: Character[];
  story?: { title: string; text: string };
}
