import { describe, expect, it } from 'vitest';
import { assessSpeech, checkTyped, detectScript, normalizeUrdu, romanKey, speechFeedback } from '../src/lib/text';

describe('Roman Urdu spelling keys', () => {
  it.each([
    ['kya', 'kia'],
    ['kya', 'kiya'],
    ['theek', 'thik'],
    ['kaise', 'kese'],
    ['kaise', 'kaisay'],
    ['hain', 'hein'],
    ['hai', 'hay'],
    ['hai', 'he'],
    ['aap', 'ap'],
    ['naam', 'nam'],
    ['shukriya', 'shukria'],
    ['yeh', 'ye'],
    ['woh', 'wo'],
    ['woh', 'vo'],
    ['qeemat', 'keemat'],
    ['aur', 'or'],
    ['chahiye', 'chahie'],
    ['acha', 'achha'],
    ['main', 'mein'],
    ['phir', 'fir'],
  ])('%s ≈ %s', (a, b) => expect(romanKey(a)).toBe(romanKey(b)));

  it.each([
    ['hai', 'hain'], // singular vs plural/respectful
    ['raha', 'rahi'], // gender
    ['mera', 'meri'],
    ['ka', 'ki'],
  ])('keeps %s and %s distinct', (a, b) => expect(romanKey(a)).not.toBe(romanKey(b)));
});

describe('checkTyped (typed answers)', () => {
  const accepted = ['Aap kaise hain?', 'aap kese hain'];

  it('accepts exact, case and punctuation variations', () => {
    expect(checkTyped('Aap kaise hain?', accepted).status).toBe('correct');
    expect(checkTyped('aap kaise hain', accepted).status).toBe('correct');
    expect(checkTyped('AAP KAISE HAIN!!', accepted).status).toBe('correct');
  });

  it('accepts common spelling variants', () => {
    expect(checkTyped('ap kesay hein', accepted).status).toBe('correct');
    expect(checkTyped('Main thik hun', ['Main theek hoon.']).status).toBe('correct');
    expect(checkTyped('mujhe pani chahie', ['Mujhe paani chahiye.']).status).toBe('correct');
  });

  it('accepts optional politeness words like "ji"', () => {
    expect(checkTyped('ji main theek hoon', ['Main theek hoon.']).status).toBe('correct');
  });

  it('forgives a one-letter typo in a long word but notes it', () => {
    const r = checkTyped('bohat shukryia', ['Bohat shukriya']);
    expect(r.status).toBe('correct');
  });

  it('does not accept a meaning-changing gender ending, and explains it', () => {
    const r = checkTyped('main urdu seekh rahi hoon', ['Main Urdu seekh raha hoon.']);
    expect(r.status).toBe('close');
    expect(r.hint).toMatch(/ending/i);
  });

  it('accepts both gender forms when both are listed', () => {
    const both = ['Main Urdu seekh raha hoon.', 'Main Urdu seekh rahi hoon.'];
    expect(checkTyped('main urdu seekh rahi hoon', both).status).toBe('correct');
    expect(checkTyped('main urdu seekh raha hoon', both).status).toBe('correct');
  });

  it('rejects answers with a different meaning', () => {
    expect(checkTyped('Aap ka naam kya hai', accepted).status).toBe('wrong');
    expect(checkTyped('Main theek hai', ['Main theek hoon.']).status).not.toBe('correct');
    expect(checkTyped('mera dost hai', ['Yeh mera dost hai.']).status).not.toBe('correct');
  });

  it('handles {name} slots with any name', () => {
    const slot = ['Mera naam {name} hai.'];
    expect(checkTyped('Mera naam Sara hai', slot).status).toBe('correct');
    expect(checkTyped('mera naam Muhammad Ali hai', slot).status).toBe('correct');
    expect(checkTyped('mera naam hai', slot).status).not.toBe('correct');
  });

  it('reports missing words', () => {
    const r = checkTyped('mujhe samajh nahi', ['Mujhe samajh nahi aaya.']);
    expect(r.status).toBe('close');
    expect(r.hint).toMatch(/missing/i);
  });

  it('treats empty input as wrong without crashing', () => {
    expect(checkTyped('   ', accepted).status).toBe('wrong');
  });
});

describe('Urdu script normalisation', () => {
  it('unifies Arabic/Urdu letter variants and strips diacritics and punctuation', () => {
    expect(normalizeUrdu('آپ کیسے ہیں؟')).toBe(normalizeUrdu('اپ كيسے هیں'));
    expect(normalizeUrdu('شُکریہ۔')).toBe('شکریہ');
  });
  it('detects scripts', () => {
    expect(detectScript('آپ کیسے ہیں')).toBe('urdu');
    expect(detectScript('aap kaise hain')).toBe('latin');
    expect(detectScript('')).toBe('none');
  });
});

describe('assessSpeech (speech-recognition result handling)', () => {
  const target = [{ roman: 'Aap kaise hain?', urdu: 'آپ کیسے ہیں؟' }];

  it('matches an Urdu-script transcript', () => {
    const a = assessSpeech(['آپ کیسے ہیں'], target);
    expect(a.status).toBe('match');
    expect(a.script).toBe('urdu');
  });

  it('matches despite spacing differences in Urdu script', () => {
    const a = assessSpeech(['آپسے مل کر خوشی ہوئی'], [{ roman: 'Aapse mil kar khushi hui', urdu: 'آپ سے مل کر خوشی ہوئی۔' }]);
    expect(a.status).toBe('match');
  });

  it('matches a Roman transcript too', () => {
    expect(assessSpeech(['aap kese hain'], target).status).toBe('match');
  });

  it('uses the best of several alternatives', () => {
    const a = assessSpeech(['آپ کسی ہیں', 'آپ کیسے ہیں'], target);
    expect(a.status).toBe('match');
    expect(a.transcript).toBe('آپ کیسے ہیں');
  });

  it('reports partial recognition with the missing words', () => {
    const a = assessSpeech(['مجھے سمجھ'], [{ roman: 'Mujhe samajh nahi aaya', urdu: 'مجھے سمجھ نہیں آیا۔' }]);
    expect(a.status).toBe('partial');
    expect(a.missingWords.length).toBeGreaterThan(0);
  });

  it('reports a different utterance without calling it a pronunciation error', () => {
    const a = assessSpeech(['کیا حال ہے'], target);
    expect(a.status).toBe('different');
    const fb = speechFeedback(a);
    expect(fb.title).toMatch(/may be correct/i);
    expect(fb.title + fb.tip).not.toMatch(/%/);
  });

  it('handles empty results', () => {
    const a = assessSpeech([], target);
    expect(a.status).toBe('empty');
    expect(speechFeedback(a).title).toMatch(/couldn't recognize/i);
    expect(assessSpeech(['   '], target).status).toBe('empty');
  });

  it('picks the matching answer among several acceptable answers (spoken Q&A)', () => {
    const answers = [
      { roman: 'Main theek hoon.', urdu: 'میں ٹھیک ہوں۔' },
      { roman: 'Alhamdulillah, theek hoon.', urdu: 'الحمدللہ، ٹھیک ہوں۔' },
    ];
    const a = assessSpeech(['الحمدللہ ٹھیک ہوں'], answers);
    expect(a.status).toBe('match');
    expect(a.target.roman).toBe('Alhamdulillah, theek hoon.');
  });

  it('accepts any name in a {name} slot', () => {
    const a = assessSpeech(['میرا نام سارہ ہے'], [{ roman: 'Mera naam {name} hai.', urdu: 'میرا نام {name} ہے۔' }]);
    expect(a.status).toBe('match');
  });

  it('never produces a pronunciation percentage in feedback', () => {
    for (const s of [['آپ کیسے ہیں'], ['آپ'], ['xyz'], []]) {
      const fb = speechFeedback(assessSpeech(s, target));
      expect(`${fb.title} ${fb.tip}`).not.toMatch(/\d+\s*%/);
    }
  });
});
