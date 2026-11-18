// Text normalisation and answer matching for Roman Urdu and Urdu script.
//
// Roman Urdu has no fixed spelling, so typed answers are compared using a "spelling key"
// that folds common variants together (aa/a, ee/i, kya/kia, hain/hein, theek/thik...).
// Meaning-changing differences — gender endings (raha/rahi), number (hai/hain),
// possessives (mera/meri) — are deliberately NOT folded, and get a specific hint.

export const SLOT_RE = /\{(\w+)\}/g;

export type Script = 'urdu' | 'latin' | 'mixed' | 'none';

export function detectScript(s: string): Script {
  const u = /[؀-ۿ]/.test(s);
  const l = /[A-Za-z]/.test(s);
  if (u && l) return 'mixed';
  if (u) return 'urdu';
  if (l) return 'latin';
  return 'none';
}

// ---------- Roman Urdu ----------

const ROMAN_SPECIAL: Record<string, string> = {
  me: 'men', // "mein" and "main" both key to "men" below
  mai: 'men',
  nahin: 'nahi',
  nhi: 'nahi',
  ni: 'nahi',
};

/** Fold a single Roman Urdu word to a spelling-insensitive key. */
export function romanKey(word: string): string {
  let t = word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9{}]/g, '');
  if (t.startsWith('{')) return t; // slot marker
  if (ROMAN_SPECIAL[t]) t = ROMAN_SPECIAL[t];
  t = t.replace(/ee/g, 'i').replace(/oo/g, 'u');
  t = t.replace(/ph/g, 'f');
  t = t.replace(/([bcdfghjklmnpqrstvwxz])y([aeiou])/g, '$1i$2'); // kya -> kia
  t = t.replace(/iy/g, 'i'); // kiya -> kia, shukriya -> shukria
  t = t.replace(/ai|ay|ei|ey/g, 'e'); // kaise -> kese, hain -> hen
  t = t.replace(/(au|aw)(?![aeiou])/g, 'o'); // aur -> or
  t = t.replace(/([^aeiou])y$/, '$1e'); // hy -> he
  t = t.replace(/([aeiou])h$/, '$1'); // yeh -> ye, woh -> wo
  t = t.replace(/w/g, 'v'); // wo / vo
  t = t.replace(/q/g, 'k'); // qeemat / keemat
  t = t.replace(/(.)\1+/g, '$1'); // collapse doubled letters
  return t;
}

/** Split Roman Urdu into lowercase words, dropping punctuation. Hyphens split words. */
export function romanWords(s: string): string[] {
  return s
    .replace(/[-_/]/g, ' ')
    .replace(/[.,!?;:"“”‘’'()…،۔؟]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

export function romanKeys(s: string): string[] {
  return romanWords(s).map(romanKey).filter(Boolean);
}

// Pairs that look alike but mean different things. Never accept one for the other.
const GENDER_PAIRS: [string, string][] = [
  ['a', 'i'], // raha/rahi, gaya/gayi, mera/meri, kaisa/kaisi, aaunga/aaungi
  ['e', 'i'], // kaise/kaisi, bolte/bolti, rahe/rahi
  ['a', 'e'], // mera/mere, raha/rahe
];

/** True when two keyed words differ only in a gender/number ending (raha vs rahi). */
export function isAgreementDifference(a: string, b: string): boolean {
  if (a === b || a.length < 2 || b.length < 2) return false;
  if (a.slice(0, -1) !== b.slice(0, -1)) {
    // also catch -nga / -ngi style future endings: aunga / aungi
    return false;
  }
  const x = a.slice(-1);
  const y = b.slice(-1);
  return GENDER_PAIRS.some(([p, q]) => (x === p && y === q) || (x === q && y === p));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Small typos are forgiven on longer words, unless the typo is a gender/number ending. */
function romanWordsMatch(input: string, target: string): 'same' | 'typo' | 'agreement' | 'different' {
  if (input === target) return 'same';
  if (isAgreementDifference(input, target)) return 'agreement';
  if (target.length >= 5 && levenshtein(input, target) <= 1) return 'typo';
  return 'different';
}

const OPTIONAL_WORDS = new Set(['ji', 'please', 'plz']);

export interface TypedCheck {
  status: 'correct' | 'close' | 'wrong';
  /** The accepted answer that matched best (display form). */
  best: string;
  /** Plain-English hint for close/wrong answers, or a spelling note for typo-level matches. */
  hint?: string;
}

/**
 * Compare a typed Roman Urdu answer against acceptable answers.
 * Slots like {name} match any 1–3 words.
 */
export function checkTyped(input: string, accepted: string[]): TypedCheck {
  const inWords = romanWords(input);
  const inKeys = inWords.map(romanKey);
  if (inKeys.length === 0) return { status: 'wrong', best: accepted[0], hint: 'Type your answer first.' };

  let bestClose: TypedCheck | null = null;
  let bestRatio = -1;
  for (const target of accepted) {
    const tKeys = romanKeys(target);
    const tSet = new Set(tKeys);
    const keys = inKeys.filter((k) => tSet.has(k) || !OPTIONAL_WORDS.has(k));
    const al = alignWords(keys, tKeys);
    if (al.missing.length === 0 && al.extra.length === 0 && al.agreement.length === 0) {
      return {
        status: 'correct',
        best: target,
        hint: al.typos.length ? `Watch the spelling of "${al.typos.join('", "')}".` : undefined,
      };
    }
    const ratio = al.matched / Math.max(tKeys.length, keys.length);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      let hint: string;
      if (al.agreement.length && al.missing.length === 0 && al.extra.length === 0) {
        hint = `Almost! Check the ending of "${al.agreement[0].input}" — it should be "${al.agreement[0].target}". Endings like -a/-i/-e change with gender or number.`;
      } else if (al.missing.length && !al.extra.length) {
        hint = `You're missing "${al.missing.join(' ')}".`;
      } else if (al.extra.length && !al.missing.length) {
        hint = `"${al.extra.join(' ')}" doesn't belong here.`;
      } else {
        hint = `Compare with: ${target}`;
      }
      bestClose = { status: ratio >= 0.6 ? 'close' : 'wrong', best: target, hint };
    }
  }
  return bestClose ?? { status: 'wrong', best: accepted[0] };
}

interface Alignment {
  matched: number;
  missing: string[];
  extra: string[];
  typos: string[];
  agreement: { input: string; target: string }[];
}

/** Dynamic-programming word alignment that supports {slot} wildcards (1–3 words). */
function alignWords(input: string[], target: string[]): Alignment {
  const n = input.length;
  const m = target.length;
  // cost table: dp[i][j] = min cost aligning input[0..i) with target[0..j)
  const INF = 1e9;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(INF));
  const back: [number, number, string][][] = Array.from({ length: n + 1 }, () => Array(m + 1));
  dp[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const c = dp[i][j];
      if (c >= INF) continue;
      const relax = (ni: number, nj: number, cost: number, op: string) => {
        if (c + cost < dp[ni][nj]) {
          dp[ni][nj] = c + cost;
          back[ni][nj] = [i, j, op];
        }
      };
      if (j < m && target[j].startsWith('{')) {
        for (let k = 1; k <= 3 && i + k <= n; k++) relax(i + k, j + 1, 0, 'slot');
        relax(i, j + 1, 1, 'miss');
        continue;
      }
      if (i < n && j < m) {
        const r = romanWordsMatch(input[i], target[j]);
        relax(i + 1, j + 1, r === 'same' ? 0 : r === 'typo' ? 0.2 : r === 'agreement' ? 0.6 : 2, r);
      }
      if (j < m) relax(i, j + 1, 1, 'miss');
      if (i < n) relax(i + 1, j, 1, 'extra');
    }
  }
  const out: Alignment = { matched: 0, missing: [], extra: [], typos: [], agreement: [] };
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const b = back[i][j];
    if (!b) break;
    const [pi, pj, op] = b;
    if (op === 'same' || op === 'slot') out.matched++;
    else if (op === 'typo') {
      out.matched++;
      out.typos.push(input[pi]);
    } else if (op === 'agreement') out.agreement.unshift({ input: input[pi], target: target[pj] });
    else if (op === 'different') {
      out.missing.unshift(target[pj]);
      out.extra.unshift(input[pi]);
    } else if (op === 'miss') out.missing.unshift(target[pj]);
    else if (op === 'extra') out.extra.unshift(input[pi]);
    i = pi;
    j = pj;
  }
  return out;
}

// ---------- Urdu script ----------

/** Normalise Urdu script: strip diacritics and punctuation, unify letter variants. */
export function normalizeUrdu(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[ً-ٰٟـ‌‍‎‏]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[هۃةۂ]/g, 'ہ')
    .replace(/ۓ/g, 'ے')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[۔؟،؛!?.,:;"'“”()…«»\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function urduWords(s: string): string[] {
  return normalizeUrdu(s).split(' ').filter(Boolean);
}

// ---------- Speech assessment ----------

export type SpeechStatus = 'match' | 'partial' | 'different' | 'empty';

export interface SpeechTarget {
  roman: string;
  urdu: string;
}

export interface WordMark {
  text: string;
  state: 'ok' | 'missing';
}

export interface SpeechAssessment {
  status: SpeechStatus;
  /** What the recogniser heard (best alternative). */
  transcript: string;
  /** Which acceptable answer it was compared against. */
  target: SpeechTarget;
  /** Target words marked as recognised or not (in the script the recogniser returned). */
  marks: WordMark[];
  /** The words of the target we did not recognise. */
  missingWords: string[];
  /** Internal overlap measure (0–1). Never shown to learners as a pronunciation score. */
  overlap: number;
  script: 'urdu' | 'latin';
}

function wordsAlike(a: string, b: string, script: 'urdu' | 'latin'): boolean {
  if (a === b) return true;
  if (script === 'latin') return romanWordsMatch(a, b) === 'same' || romanWordsMatch(a, b) === 'typo';
  return a.length >= 3 && b.length >= 3 && levenshtein(a, b) <= 1;
}

function speechAlign(heard: string[], target: string[], script: 'urdu' | 'latin') {
  // LCS-style alignment with slot wildcards; returns which target words were found.
  const n = heard.length;
  const m = target.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const isSlot = target[j - 1].startsWith('{');
      const same = isSlot || wordsAlike(heard[i - 1], target[j - 1], script);
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], same ? dp[i - 1][j - 1] + 1 : 0);
    }
  }
  const found = Array(m).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const isSlot = target[j - 1].startsWith('{');
    if ((isSlot || wordsAlike(heard[i - 1], target[j - 1], script)) && dp[i][j] === dp[i - 1][j - 1] + 1) {
      found[j - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return found;
}

/** Character-level similarity ignoring spaces (handles "آپ سے" vs "آپسے"). */
function charSimilarity(a: string, b: string): number {
  const x = a.replace(/\s+/g, '');
  const y = b.replace(/\s+/g, '');
  if (!x.length && !y.length) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/**
 * Compare speech-recognition alternatives with acceptable targets.
 * The result describes recognition, not pronunciation: a recogniser can mishear correct speech.
 */
export function assessSpeech(alternatives: string[], targets: SpeechTarget[]): SpeechAssessment {
  const alts = alternatives.map((a) => a.trim()).filter(Boolean);
  if (alts.length === 0 || targets.length === 0) {
    return {
      status: 'empty',
      transcript: '',
      target: targets[0] ?? { roman: '', urdu: '' },
      marks: [],
      missingWords: [],
      overlap: 0,
      script: 'urdu',
    };
  }
  let best: SpeechAssessment | null = null;
  for (const alt of alts) {
    const script: 'urdu' | 'latin' = detectScript(alt) === 'latin' ? 'latin' : 'urdu';
    const heard = script === 'urdu' ? urduWords(alt) : romanKeys(alt);
    for (const t of targets) {
      const display = script === 'urdu' ? urduWords(t.urdu.replace(SLOT_RE, '{$1}')) : romanWords(t.roman);
      const keyed = script === 'urdu' ? display : display.map(romanKey);
      const found = speechAlign(heard, keyed, script);
      const nonSlot = keyed.filter((w) => !w.startsWith('{')).length || 1;
      const foundCount = found.filter((f, k) => f && !keyed[k].startsWith('{')).length;
      let overlap = foundCount / nonSlot;
      // Spacing differences in Urdu script: fall back to character similarity when there is no slot.
      if (!keyed.some((w) => w.startsWith('{'))) {
        const sim = charSimilarity(heard.join(' '), keyed.join(' '));
        if (sim >= 0.85) overlap = Math.max(overlap, sim);
      }
      const status: SpeechStatus = overlap >= 0.85 ? 'match' : overlap >= 0.5 ? 'partial' : 'different';
      const marks = display.map((w, k) => ({ text: w, state: (found[k] || overlap >= 0.85 ? 'ok' : 'missing') as WordMark['state'] }));
      const cand: SpeechAssessment = {
        status,
        transcript: alt,
        target: t,
        marks,
        missingWords: marks.filter((m) => m.state === 'missing' && !m.text.startsWith('{')).map((m) => m.text),
        overlap,
        script,
      };
      if (!best || cand.overlap > best.overlap) best = cand;
    }
  }
  return best!;
}

/** Honest, capability-aware feedback text for a speech attempt. */
export function speechFeedback(a: SpeechAssessment, romanHint?: string): { title: string; tip: string } {
  switch (a.status) {
    case 'match':
      return { title: 'We recognized your phrase.', tip: 'Good practice — try it again at a natural speed.' };
    case 'partial': {
      const w = romanHint ?? a.missingWords[0];
      return {
        title: 'We recognized part of it.',
        tip: w ? `Try saying "${w}" more slowly and clearly.` : 'Try saying the phrase a little more slowly.',
      };
    }
    case 'different':
      return {
        title: "Your spoken answer may be correct, but we couldn't verify it.",
        tip: 'Speech recognition can mishear learners. Listen to the model once more and try again.',
      };
    default:
      return { title: "We couldn't recognize that attempt.", tip: 'Listen and try again — speak a little closer to the microphone.' };
  }
}

/** Replace {name}-style slots for display. */
export function fillSlots(s: string, name: string): string {
  return s.replace(SLOT_RE, (_m, key: string) => (key === 'name' ? name : `[${key}]`));
}
