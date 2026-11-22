// Building Blocks screens: the sentence-pattern card, and "say it" (anticipation) practice.
import { useEffect, useState } from 'react';
import { useName } from '../hooks';
import { displayForm, speechTargets, type Exercise, acceptedRoman } from '../lib/exercises';
import { checkTyped, fillSlots } from '../lib/text';
import { audio } from '../services/audio';
import { useSettings } from '../state/store';
import { PhraseText, PlayButtons } from './common';
import type { ExApi } from './exercises';
import { IconEye } from './Icons';
import { SpeakPanel } from './SpeakPanel';
import { WordBreakdown } from './WordBreakdown';

type Of<K extends Exercise['kind']> = Extract<Exercise, { kind: K }>;

/** Shows a frame like "Mujhe ___ chahiye" with the gap highlighted. */
function Frame({ text, dir }: { text: string; dir: 'ltr' | 'rtl' }) {
  const parts = text.split('___');
  return (
    <span dir={dir}>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="slot-box">…</span>}
        </span>
      ))}
    </span>
  );
}

export function PatternCard({ ex, api }: { ex: Of<'pattern'>; api: ExApi }) {
  const name = useName();
  const settings = useSettings();
  useEffect(() => api.setCheck(null), []); // eslint-disable-line
  const p = ex.pattern;
  return (
    <div>
      <div className="ex-kicker">Sentence pattern</div>
      <h2 className="ex-title">{p.title}</h2>
      <div className="pattern-card">
        <div className="roman" lang="ur-Latn" style={{ fontSize: '1.5rem' }}>
          <Frame text={p.frame.roman} dir="ltr" />
        </div>
        {settings.showUrdu && (
          <div className="urdu" lang="ur" style={{ fontSize: '1.5rem' }}>
            <Frame text={p.frame.urdu} dir="rtl" />
          </div>
        )}
        <div className="en">
          <Frame text={p.frame.en} dir="ltr" />
        </div>
        {p.literal && (
          <div className="small" style={{ marginTop: 6 }}>
            Word for word: <em>{p.literal}</em>
          </div>
        )}
      </div>
      <p style={{ marginTop: 14 }}>{p.explain}</p>
      {ex.examples.map((b) => {
        const f = displayForm(b, settings.learnerGender, name);
        return (
          <div key={b.id} className="tip-example">
            <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(b.en, name)} show={{ en: true, roman: true }} />
            <div style={{ marginTop: 6 }}>
              <PlayButtons item={{ urdu: f.urdu, voice: api.host }} compact />
            </div>
            <WordBreakdown urdu={f.urdu} />
          </div>
        );
      })}
    </div>
  );
}

export function SayEx({ ex, api }: { ex: Of<'say'>; api: ExApi }) {
  const name = useName();
  const settings = useSettings();
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [typed, setTyped] = useState('');
  const [recognized, setRecognized] = useState(false);
  const [typedResult, setTypedResult] = useState<null | 'correct' | 'close' | 'wrong'>(null);
  useEffect(() => api.setCheck(null), []); // eslint-disable-line
  const p = ex.phrase;
  const f = displayForm(p, settings.learnerGender, name);
  const reveal = () => {
    setRevealed(true);
    void audio.play({ urdu: f.urdu, voice: api.host });
  };
  const checkTypedAnswer = () => {
    const r = checkTyped(typed, acceptedRoman(p));
    setTypedResult(r.status);
    reveal();
    if (r.status !== 'close') api.answer(r.status === 'correct', { hint: r.hint, correctAnswer: <span lang="ur-Latn">{f.roman}</span> });
  };

  return (
    <div>
      <div className="ex-kicker">Say it in Urdu</div>
      <h2 className="ex-title">
        How would you say: <span className="say-prompt">"{fillSlots(p.en, name)}"</span>
      </h2>
      {!revealed && (
        <>
          {hint ? (
            <div className="row wrap" style={{ marginBottom: 10 }} aria-label="Words you need">
              {ex.hintWords.map((w, i) => (
                <span key={i} className="chip teal" lang="ur-Latn">
                  {w}
                </span>
              ))}
            </div>
          ) : (
            <button className="btn small ghost" onClick={() => setHint(true)}>
              <IconEye /> Show me the words I need
            </button>
          )}
          <SpeakPanel
            phraseKey={ex.id}
            label={f.roman}
            targets={speechTargets(p)}
            model={null}
            showModelButtons={false}
            name={name}
            hideExpected
            prompt="Say it out loud:"
            onAttempt={(r) => {
              api.noteAttempt(r);
              if (r.outcome === 'match') {
                setRecognized(true);
                reveal();
              }
            }}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <label className="sr-only" htmlFor={`type-${ex.id}`}>
              Or type it in Roman Urdu
            </label>
            <input
              id={`type-${ex.id}`}
              className="search grow"
              lang="ur-Latn"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="…or type it in Roman Urdu"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && typed.trim() && checkTypedAnswer()}
            />
            {typed.trim() && (
              <button className="btn" onClick={checkTypedAnswer}>
                Check
              </button>
            )}
          </div>
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={reveal}>
            I've said it — show me the answer
          </button>
        </>
      )}
      {revealed && (
        <div className="phrase-card" style={{ marginTop: 6 }}>
          {recognized && <p className="small">✅ We recognized your answer.</p>}
          {typedResult === 'close' && <p className="small">Almost! Compare your answer with this:</p>}
          <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p.en, name)} show={{ en: true, roman: true }} size="lg" />
          <div style={{ marginTop: 8 }}>
            <PlayButtons item={{ urdu: f.urdu, voice: api.host }} compact />
          </div>
          <WordBreakdown urdu={f.urdu} />
          {p.note && <div className="note">{p.note}</div>}
          {!api.locked && typedResult !== 'correct' && typedResult !== 'wrong' && (
            <>
              <p style={{ fontWeight: 800, margin: '14px 0 6px' }}>Did you get it?</p>
              <div className="grid-2">
                <button className="btn" onClick={() => api.answer(false, { explain: "It'll come back later in the lesson so you can try again." })}>
                  Not quite
                </button>
                <button className="btn primary" onClick={() => api.answer(true)}>
                  I got it!
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
