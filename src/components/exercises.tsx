// One component per exercise type. All share the ExApi contract with SessionRunner.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useName } from '../hooks';
import { displayForm, speechTargets, type Exercise } from '../lib/exercises';
import { checkTyped, fillSlots } from '../lib/text';
import { audio } from '../services/audio';
import { store, useSettings } from '../state/store';
import type { Phrase } from '../types';
import { PhraseText, PlayButtons } from './common';
import { IconEye, IconPlay } from './Icons';
import { SpeakPanel, type AttemptResult } from './SpeakPanel';
import { WordBreakdown } from './WordBreakdown';
import { DialogueEx } from './DialogueEx';
import { PatternCard, SayEx } from './BuildEx';
import { useCharacter } from '../state/course';
import { TEACHER } from '../lib/teacher';

export interface Feedback {
  correctAnswer?: ReactNode;
  explain?: string;
  hint?: string;
}

export interface ExApi {
  locked: boolean;
  answer(correct: boolean, fb?: Feedback, opts?: { requeue?: boolean }): void;
  setCheck(fn: (() => void) | null): void;
  /** Speaking exercises report attempts so the footer can say "Continue" instead of "Skip". */
  noteAttempt(r: AttemptResult): void;
  /** Character teaching this lesson: their voice says the phrases. */
  host?: string;
}

type Of<K extends Exercise['kind']> = Extract<Exercise, { kind: K }>;

function Kicker({ children }: { children: ReactNode }) {
  return <div className="ex-kicker">{children}</div>;
}

function useGender() {
  return useSettings().learnerGender;
}

// ---------- Intro (new phrase) ----------

export function IntroCard({ ex, api }: { ex: Of<'intro'>; api?: ExApi }) {
  const name = useName();
  const gender = useGender();
  const settings = useSettings();
  const p = ex.phrase;
  const f = displayForm(p, gender, name);
  const [nameDraft, setNameDraft] = useState(settings.learnerName);
  return (
    <div>
      <Kicker>{p.kind === 'word' ? 'New word' : 'New phrase'}</Kicker>
      <Speaker id={api?.host} line="teaches you:" />
      <div className="phrase-card">
        {p.emoji && (
          <div className="word-pic" aria-hidden>
            {p.emoji}
          </div>
        )}
        <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p.en, name)} show={{ en: true, roman: true }} size="lg" />
        <div style={{ marginTop: 12 }}>
          <PlayButtons item={{ urdu: f.urdu, audio: p.audio, voice: api?.host }} autoPlay />
        </div>
        {p.literal && (
          <p className="small muted" style={{ marginTop: 10 }}>
            Word for word: <em>{p.literal}</em>
          </p>
        )}
        {p.note && <div className="note">{p.note}</div>}
        {p.genderVariants && <GenderBox phrase={p} name={name} />}
        <WordBreakdown urdu={f.urdu} />
        {p.slot === 'name' && (
          <div className="gender-box">
            <label htmlFor={`name-${p.id}`} style={{ fontWeight: 700 }}>
              Practise with your own name
            </label>
            <div className="row" style={{ marginTop: 6 }}>
              <input
                id={`name-${p.id}`}
                className="search"
                value={nameDraft}
                maxLength={30}
                placeholder="Your name"
                autoComplete="given-name"
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <button className="btn" onClick={() => store.update((s) => ({ ...s, settings: { ...s.settings, learnerName: nameDraft.trim() } }))}>
                Use
              </button>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              Saved on this device only. The model voice may pronounce non-Urdu names oddly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function GenderBox({ phrase, name }: { phrase: Phrase; name: string }) {
  const g = phrase.genderVariants!;
  return (
    <div className="gender-box">
      <strong>{g.by === 'speaker' ? 'Men and women say this differently' : 'Changes with who you mean'}</strong>
      <div className="forms">
        <div>
          <div className="small muted">{g.by === 'speaker' ? 'Male speaker' : 'Masculine'}</div>
          <div className="roman" lang="ur-Latn">
            {fillSlots(g.masculine.roman, name)}
          </div>
          <div className="urdu" lang="ur" dir="rtl" style={{ fontSize: '1rem' }}>
            {fillSlots(g.masculine.urdu, name)}
          </div>
        </div>
        <div>
          <div className="small muted">{g.by === 'speaker' ? 'Female speaker' : 'Feminine'}</div>
          <div className="roman" lang="ur-Latn">
            {fillSlots(g.feminine.roman, name)}
          </div>
          <div className="urdu" lang="ur" dir="rtl" style={{ fontSize: '1rem' }}>
            {fillSlots(g.feminine.urdu, name)}
          </div>
        </div>
      </div>
      <p className="small" style={{ margin: '8px 0 0' }}>
        {g.explain}
      </p>
    </div>
  );
}

// ---------- Multiple choice ----------

export function McqEx({ ex, api }: { ex: Of<'mcq'>; api: ExApi }) {
  const [sel, setSel] = useState<number | null>(null);
  const name = useName();
  const gender = useGender();
  useEffect(() => {
    api.setCheck(sel === null ? null : () => api.answer(sel === ex.answer, { correctAnswer: ex.options[ex.answer].label, explain: ex.explain }));
  }, [sel]);
  const promptForm = ex.promptPhrase ? displayForm(ex.promptPhrase, gender, name) : null;
  return (
    <div>
      <Kicker>Choose the answer</Kicker>
      <h2 className="ex-title">{ex.prompt}</h2>
      {promptForm && (
        <div className="phrase-card" style={{ marginBottom: 16 }}>
          <PhraseText roman={promptForm.roman} urdu={promptForm.urdu} show={{ roman: true }} />
          <div style={{ marginTop: 8 }}>
            <PlayButtons item={{ urdu: promptForm.urdu, audio: ex.promptPhrase!.audio }} compact />
          </div>
        </div>
      )}
      <div className={`options ${ex.options.some((o) => o.emoji) ? 'picture-grid' : ''}`} role="group" aria-label="Answer options">
        {ex.options.map((o, i) => (
          <button
            key={i}
            className={`option ${o.emoji ? 'picture' : ''} ${api.locked && i === ex.answer ? 'is-correct' : ''} ${api.locked && sel === i && i !== ex.answer ? 'is-wrong' : ''}`}
            aria-pressed={sel === i}
            disabled={api.locked}
            onClick={() => setSel(i)}
          >
            {o.emoji && (
              <span className="pic" aria-hidden>
                {o.emoji}
              </span>
            )}
            <span className={ex.optionsAreRoman ? 'roman' : ''} lang={ex.optionsAreRoman ? 'ur-Latn' : 'en'}>
              {o.label}
            </span>
            {o.urdu && <OptionUrdu urdu={o.urdu} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function OptionUrdu({ urdu }: { urdu: string }) {
  const s = useSettings();
  if (!s.showUrdu) return null;
  return (
    <span className="urdu" lang="ur" dir="rtl">
      {urdu}
    </span>
  );
}

// ---------- Listening ----------

export function ListenEx({ ex, api }: { ex: Of<'listen'>; api: ExApi }) {
  const [sel, setSel] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const name = useName();
  const gender = useGender();
  const f = displayForm(ex.phrase, gender, name);
  const item = { urdu: f.urdu, audio: ex.phrase.audio, voice: api.host };
  const source = audio.sourceFor(item);
  useEffect(() => {
    api.setCheck(
      sel === null
        ? null
        : () =>
            api.answer(sel === ex.answer, {
              correctAnswer: (
                <>
                  <span lang="ur-Latn" className="roman">
                    {f.roman}
                  </span>{' '}
                  = {ex.options[ex.answer]}
                </>
              ),
            }),
    );
  }, [sel]);
  return (
    <div>
      <Kicker>Listening</Kicker>
      <Speaker id={api.host} line="says something:" />
      <h2 className="ex-title">What do you hear?</h2>
      {source !== 'none' ? (
        <div className="phrase-card center" style={{ marginBottom: 16 }}>
          <PlayButtons item={item} autoPlay />
          {(reveal || api.locked) && (
            <div style={{ marginTop: 10 }}>
              <PhraseText roman={f.roman} urdu={f.urdu} show={{ en: false }} />
            </div>
          )}
          {!reveal && !api.locked && (
            <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setReveal(true)}>
              <IconEye /> Show text
            </button>
          )}
        </div>
      ) : (
        <div className="phrase-card" style={{ marginBottom: 16 }}>
          <p className="small muted">No Urdu voice is available on this device, so read it instead:</p>
          <PhraseText roman={f.roman} urdu={f.urdu} show={{ en: false, roman: true }} />
        </div>
      )}
      <div className="options" role="group" aria-label="Meaning options">
        {ex.options.map((o, i) => (
          <button
            key={i}
            className={`option ${api.locked && i === ex.answer ? 'is-correct' : ''} ${api.locked && sel === i && i !== ex.answer ? 'is-wrong' : ''}`}
            aria-pressed={sel === i}
            disabled={api.locked}
            onClick={() => setSel(i)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Matching pairs ----------

export function MatchEx({ ex, api }: { ex: Of<'match'>; api: ExApi }) {
  const rights = useMemo(() => [...ex.pairs].sort((a, b) => a.roman.localeCompare(b.roman)), [ex]);
  const [left, setLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);
  const mistakes = useRef(0);
  useEffect(() => api.setCheck(null), []);

  const pick = (rightId: string) => {
    if (!left) return;
    if (left === rightId) {
      const next = [...matched, rightId];
      setMatched(next);
      setLeft(null);
      if (next.length === ex.pairs.length) {
        api.answer(mistakes.current <= 1, {
          explain: mistakes.current ? `${mistakes.current} mismatch${mistakes.current > 1 ? 'es' : ''} along the way.` : 'All pairs matched first time!',
        });
      }
    } else {
      mistakes.current++;
      setWrongFlash(rightId);
      setTimeout(() => setWrongFlash(null), 500);
    }
  };
  return (
    <div>
      <Kicker>Match the pairs</Kicker>
      <h2 className="ex-title">Tap an English meaning, then its Roman Urdu.</h2>
      <div className="match-grid">
        <div className="options">
          {ex.pairs.map((p) => (
            <button
              key={p.phraseId}
              className={`option ${matched.includes(p.phraseId) ? 'matched' : ''}`}
              aria-pressed={left === p.phraseId}
              disabled={matched.includes(p.phraseId) || api.locked}
              onClick={() => setLeft(p.phraseId)}
            >
              {p.en}
            </button>
          ))}
        </div>
        <div className="options">
          {rights.map((p) => (
            <button
              key={p.phraseId}
              className={`option roman ${matched.includes(p.phraseId) ? 'matched' : ''} ${wrongFlash === p.phraseId ? 'is-wrong' : ''}`}
              lang="ur-Latn"
              disabled={matched.includes(p.phraseId) || api.locked || !left}
              onClick={() => pick(p.phraseId)}
            >
              {p.roman}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Word order ----------

export function OrderEx({ ex, api }: { ex: Of<'order'>; api: ExApi }) {
  const [chosen, setChosen] = useState<number[]>([]);
  const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '');
  useEffect(() => {
    api.setCheck(
      chosen.length === 0
        ? null
        : () => {
            const got = chosen.map((i) => norm(ex.tokens[i])).join(' ');
            const want = ex.answer.map(norm).join(' ');
            api.answer(got === want, { correctAnswer: <span lang="ur-Latn">{ex.roman}</span>, explain: ex.explain });
          },
    );
  }, [chosen]);
  return (
    <div>
      <Kicker>Build the sentence</Kicker>
      <h2 className="ex-title">{ex.en}</h2>
      <div className="tile-tray" aria-label="Your sentence" lang="ur-Latn">
        {chosen.length === 0 && <span className="muted small">Tap the words below in order</span>}
        {chosen.map((i, k) => (
          <button key={k} className="tile" disabled={api.locked} onClick={() => setChosen(chosen.filter((_, j) => j !== k))}>
            {ex.tokens[i]}
          </button>
        ))}
      </div>
      <div className="row wrap" lang="ur-Latn">
        {ex.tokens.map((t, i) => (
          <button key={i} className="tile" disabled={chosen.includes(i) || api.locked} onClick={() => setChosen([...chosen, i])}>
            {t}
          </button>
        ))}
      </div>
      {api.locked && (
        <div className="phrase-card" style={{ marginTop: 16 }}>
          <PhraseText roman={ex.roman} urdu={ex.urdu} show={{ en: false }} />
        </div>
      )}
    </div>
  );
}

// ---------- Type the translation ----------

export function TranslateEx({ ex, api }: { ex: Of<'translate'>; api: ExApi }) {
  const name = useName();
  const gender = useGender();
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const hintUsed = useRef(false);
  const f = displayForm(ex.phrase, gender, name);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  const check = () => {
    const r = checkTyped(text, ex.accepted);
    if (r.status === 'close' && !hintUsed.current) {
      hintUsed.current = true;
      setHint(r.hint ?? 'Almost — check your answer.');
      return;
    }
    api.answer(r.status === 'correct', {
      correctAnswer: <span lang="ur-Latn">{fillSlots(r.status === 'correct' ? r.best : f.roman, name)}</span>,
      hint: r.status === 'correct' ? r.hint : r.hint,
      explain: ex.phrase.note,
    });
  };
  useEffect(() => {
    api.setCheck(text.trim() ? check : null);
  }, [text]);
  return (
    <div>
      <Kicker>Write it in Roman Urdu</Kicker>
      <h2 className="ex-title" lang="en">
        {fillSlots(ex.phrase.en, name)}
      </h2>
      {ex.phrase.slot === 'name' && <p className="small muted">Use any name — yours works.</p>}
      <label className="sr-only" htmlFor={`t-${ex.id}`}>
        Your answer in Roman Urdu
      </label>
      <textarea
        id={`t-${ex.id}`}
        ref={ref}
        className="text-answer"
        lang="ur-Latn"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Type in Roman Urdu…"
        value={text}
        disabled={api.locked}
        onChange={(e) => {
          setText(e.target.value);
          setHint(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (text.trim() && !api.locked) check();
          }
        }}
      />
      {hint && (
        <p className="banner" role="status">
          {hint} Try once more.
        </p>
      )}
      <p className="small muted">Spelling variations like "kya / kia" or "theek / thik" are accepted.</p>
    </div>
  );
}

// ---------- Fill in the blank ----------

export function FillEx({ ex, api }: { ex: Of<'fill'>; api: ExApi }) {
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    api.setCheck(sel === null ? null : () => api.answer(sel === ex.answer, { correctAnswer: <span lang="ur-Latn">{ex.roman.replace('___', ex.options[ex.answer])}</span>, explain: ex.explain }));
  }, [sel]);
  const [before, after] = ex.roman.split('___');
  return (
    <div>
      <Kicker>Fill in the blank</Kicker>
      <h2 className="ex-title" lang="en">
        {ex.en}
      </h2>
      <div className="phrase-card" style={{ marginBottom: 16 }}>
        <div className="roman" lang="ur-Latn" style={{ fontSize: '1.3rem' }}>
          {before}
          <span style={{ borderBottom: '3px solid var(--primary)', padding: '0 6px', minWidth: 60, display: 'inline-block' }}>{sel !== null ? ex.options[sel] : ' '}</span>
          {after}
        </div>
      </div>
      <div className="row wrap" lang="ur-Latn">
        {ex.options.map((o, i) => (
          <button
            key={i}
            className={`tile ${api.locked && i === ex.answer ? 'is-correct' : ''}`}
            aria-pressed={sel === i}
            style={sel === i ? { borderColor: 'var(--primary)', background: 'var(--primary-soft)' } : undefined}
            disabled={api.locked}
            onClick={() => setSel(i)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Conversation completion ----------

export function CompleteEx({ ex, api }: { ex: Of<'complete'>; api: ExApi }) {
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    api.setCheck(sel === null ? null : () => api.answer(sel === ex.answer, { correctAnswer: <span lang="ur-Latn">{ex.options[ex.answer].roman}</span>, explain: ex.explain }));
  }, [sel]);
  return (
    <div>
      <Kicker>Complete the conversation</Kicker>
      <h2 className="ex-title">{ex.prompt}</h2>
      <div className="dialogue">
        {ex.context.map((l, i) => (
          <div key={i} className={`bubble ${l.speaker === 'You' ? 'me' : 'them'}`}>
            <div className="who">{l.speaker}</div>
            <PhraseText roman={l.roman} urdu={l.urdu} en={l.en} />
            {l.speaker !== 'You' && (
              <button className="btn small ghost" onClick={() => void audio.play({ urdu: l.urdu })} aria-label={`Play ${l.speaker}'s line`}>
                <IconPlay /> Play
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="options" role="group" aria-label="Your reply">
        {ex.options.map((o, i) => (
          <button
            key={i}
            className={`option ${api.locked && i === ex.answer ? 'is-correct' : ''} ${api.locked && sel === i && i !== ex.answer ? 'is-wrong' : ''}`}
            aria-pressed={sel === i}
            disabled={api.locked}
            onClick={() => setSel(i)}
          >
            <span className="roman" lang="ur-Latn">
              {o.roman}
            </span>
            {api.locked && <span className="en small">{o.en}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Flashcard (self-graded recall, optionally spoken) ----------

export function FlashcardEx({ ex, api }: { ex: Of<'flashcard'>; api: ExApi }) {
  const name = useName();
  const gender = useGender();
  const [revealed, setRevealed] = useState(false);
  const f = displayForm(ex.phrase, gender, name);
  useEffect(() => api.setCheck(null), []);
  const front = ex.direction === 'en-roman' ? fillSlots(ex.phrase.en, name) : f.roman;
  return (
    <div>
      <Kicker>Flashcard</Kicker>
      <h2 className="ex-title">{ex.direction === 'en-roman' ? 'Say it in Urdu (out loud!), then flip.' : 'What does this mean?'}</h2>
      <div className="phrase-card center" style={{ minHeight: 160 }}>
        <div className={ex.direction === 'en-roman' ? '' : 'roman'} style={{ fontSize: '1.4rem', fontWeight: 700 }} lang={ex.direction === 'en-roman' ? 'en' : 'ur-Latn'}>
          {front}
        </div>
        {revealed && (
          <div style={{ marginTop: 14 }}>
            <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(ex.phrase.en, name)} show={{ en: true, roman: true }} />
            <div style={{ marginTop: 8 }}>
              <PlayButtons item={{ urdu: f.urdu, audio: ex.phrase.audio }} compact autoPlay />
            </div>
          </div>
        )}
      </div>
      <div className="stack" style={{ marginTop: 16 }}>
        {!revealed ? (
          <button className="btn primary block" onClick={() => setRevealed(true)}>
            Flip card
          </button>
        ) : (
          !api.locked && (
            <div className="grid-2">
              <button className="btn block" onClick={() => api.answer(false, { explain: "No problem — you'll see it again soon." }, { requeue: false })}>
                Not yet
              </button>
              <button className="btn primary block" onClick={() => api.answer(true, {}, { requeue: false })}>
                I knew it
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ---------- Repeat after me ----------

export function RepeatEx({ ex, api }: { ex: Of<'repeat'>; api: ExApi }) {
  const name = useName();
  const gender = useGender();
  const settings = useSettings();
  const [showEn, setShowEn] = useState(settings.showEnglish);
  const p = ex.phrase;
  const f = displayForm(p, gender, name);
  useEffect(() => api.setCheck(null), []);
  return (
    <div>
      <Kicker>Repeat after me</Kicker>
      <h2 className="ex-title">Listen, then say it out loud.</h2>
      <div className="phrase-card">
        <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p.en, name)} show={{ en: showEn, roman: true }} size="lg" />
        <button className="btn small ghost" onClick={() => setShowEn(!showEn)} aria-pressed={showEn}>
          {showEn ? 'Hide English' : 'Show English'}
        </button>
        {p.genderVariants && <GenderBox phrase={p} name={name} />}
        <WordBreakdown urdu={f.urdu} />
      </div>
      <SpeakPanel
        phraseKey={p.id}
        label={f.roman}
        targets={speechTargets(p)}
        model={{ urdu: f.urdu, audio: p.audio, voice: api.host }}
        name={name}
        onAttempt={api.noteAttempt}
      />
    </div>
  );
}

// ---------- Spoken question & answer ----------

export function SpokenQAEx({ ex, api }: { ex: Of<'spokenQA'>; api: ExApi }) {
  const name = useName();
  const settings = useSettings();
  const mode = settings.qaMode;
  const q = ex.question;
  const [helpShown, setHelpShown] = useState(mode === 'beginner');
  useEffect(() => api.setCheck(null), []);
  useEffect(() => setHelpShown(mode === 'beginner'), [mode]);
  return (
    <div>
      <Kicker>Answer out loud</Kicker>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 className="ex-title" style={{ margin: 0 }}>
          Listen and reply in Urdu.
        </h2>
        <QaModePicker />
      </div>
      <div className="bubble them" style={{ maxWidth: '100%', marginBottom: 8 }}>
        <PlayButtons item={{ urdu: q.question.urdu }} autoPlay compact />
        {mode !== 'challenge' || helpShown ? (
          <div style={{ marginTop: 8 }}>
            <PhraseText roman={q.question.roman} urdu={q.question.urdu} en={helpShown ? q.question.en : undefined} show={{ en: helpShown, roman: true }} />
          </div>
        ) : null}
        {!helpShown && (
          <button className="btn small ghost" onClick={() => setHelpShown(true)}>
            <IconEye /> {mode === 'challenge' ? 'Show the question text' : 'Show English help'}
          </button>
        )}
      </div>
      {mode === 'beginner' && q.hints && (
        <ul className="small muted" style={{ margin: '0 0 8px', paddingLeft: 18 }}>
          {q.hints.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      <SpeakPanel
        phraseKey={q.id}
        label={q.question.roman}
        targets={q.answers}
        model={null}
        name={name}
        hideExpected={mode !== 'beginner'}
        prompt={mode === 'challenge' ? 'Think of your answer, then speak.' : undefined}
        onAttempt={api.noteAttempt}
      />
      <details className="disclosure">
        <summary>Hear a sample answer</summary>
        {q.answers.slice(0, 2).map((a, i) => (
          <div key={i} className="row" style={{ marginBottom: 6 }}>
            <button className="icon-btn" aria-label="Play sample answer" onClick={() => void audio.play({ urdu: fillSlots(a.urdu, name) })}>
              <IconPlay />
            </button>
            <div>
              <div className="roman" lang="ur-Latn">
                {fillSlots(a.roman, name)}
              </div>
              <div className="small muted">{fillSlots(a.en, name)}</div>
            </div>
          </div>
        ))}
      </details>
    </div>
  );
}

export function QaModePicker() {
  const s = useSettings();
  const set = (m: typeof s.qaMode) => store.update((st) => ({ ...st, settings: { ...st.settings, qaMode: m } }));
  return (
    <div className="segmented" role="group" aria-label="Difficulty">
      {(['beginner', 'intermediate', 'challenge'] as const).map((m) => (
        <button key={m} aria-pressed={s.qaMode === m} onClick={() => set(m)}>
          {m === 'beginner' ? 'Beginner' : m === 'intermediate' ? 'Middle' : 'Challenge'}
        </button>
      ))}
    </div>
  );
}

// ---------- Read aloud ----------

export function ReadAloudEx({ ex, api }: { ex: Of<'readAloud'>; api: ExApi }) {
  const [showUrdu, setShowUrdu] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [answered, setAnswered] = useState<number | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const name = useName();
  const p = ex.passage;
  useEffect(() => api.setCheck(null), []);
  const playAll = async (slow: boolean) => {
    setPlayingAll(true);
    for (const l of p.lines) {
      const r = await audio.play({ urdu: l.urdu }, { slow });
      if (r !== 'played') break;
    }
    setPlayingAll(false);
  };
  const hasVoice = audio.sourceFor(p.lines[0]) !== 'none';
  return (
    <div>
      <Kicker>Read aloud</Kicker>
      <h2 className="ex-title">{p.title}</h2>
      <p className="small muted">Read each line aloud in Roman Urdu. Tap a line to practise it on its own.</p>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {hasVoice && (
          <>
            <button className="btn small" onClick={() => playAll(false)} disabled={playingAll}>
              <IconPlay /> Whole passage
            </button>
            <button className="btn small" onClick={() => playAll(true)} disabled={playingAll}>
              Slow
            </button>
            {playingAll && (
              <button className="btn small ghost" onClick={() => audio.stop()}>
                Stop
              </button>
            )}
          </>
        )}
        <button className="btn small ghost" aria-pressed={showUrdu} onClick={() => setShowUrdu(!showUrdu)}>
          {showUrdu ? 'Hide' : 'Show'} Urdu script
        </button>
        <button className="btn small ghost" aria-pressed={showEn} onClick={() => setShowEn(!showEn)}>
          {showEn ? 'Hide' : 'Show'} English
        </button>
      </div>
      <ol className="lesson-list" style={{ marginTop: 0 }}>
        {p.lines.map((l, i) => (
          <li key={i} style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
            <button
              className="option"
              style={{ boxShadow: 'none' }}
              aria-expanded={active === i}
              onClick={() => setActive(active === i ? null : i)}
            >
              {'speaker' in l && <span className="small muted">{(l as { speaker: string }).speaker}</span>}
              <span className="roman" lang="ur-Latn">
                {l.roman}
              </span>
              {showUrdu && (
                <span className="urdu" lang="ur" dir="rtl">
                  {l.urdu}
                </span>
              )}
              {showEn && <span className="en small">{l.en}</span>}
            </button>
            {active === i && (
              <SpeakPanel
                phraseKey={`${p.id}#${i}`}
                label={l.roman}
                targets={[{ roman: l.roman, urdu: l.urdu }]}
                model={{ urdu: l.urdu }}
                name={name}
                onAttempt={api.noteAttempt}
              />
            )}
          </li>
        ))}
      </ol>
      {p.question && (
        <div className="card soft" style={{ marginTop: 16 }}>
          <strong>Check your understanding</strong>
          <p>{p.question.prompt}</p>
          <div className="options">
            {p.question.options.map((o, i) => (
              <button
                key={i}
                className={`option ${answered !== null && i === p.question!.answer ? 'is-correct' : ''} ${answered === i && i !== p.question!.answer ? 'is-wrong' : ''}`}
                disabled={answered !== null || api.locked}
                onClick={() => {
                  setAnswered(i);
                  api.answer(i === p.question!.answer, { correctAnswer: p.question!.options[p.question!.answer], explain: p.question!.explain }, { requeue: false });
                }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ExerciseView({ ex, api }: { ex: Exercise; api: ExApi }) {
  switch (ex.kind) {
    case 'intro':
      return <IntroCard ex={ex} api={api} />;
    case 'mcq':
      return <McqEx ex={ex} api={api} />;
    case 'listen':
      return <ListenEx ex={ex} api={api} />;
    case 'match':
      return <MatchEx ex={ex} api={api} />;
    case 'order':
      return <OrderEx ex={ex} api={api} />;
    case 'translate':
      return <TranslateEx ex={ex} api={api} />;
    case 'fill':
      return <FillEx ex={ex} api={api} />;
    case 'complete':
      return <CompleteEx ex={ex} api={api} />;
    case 'flashcard':
      return <FlashcardEx ex={ex} api={api} />;
    case 'repeat':
      return <RepeatEx ex={ex} api={api} />;
    case 'spokenQA':
      return <SpokenQAEx ex={ex} api={api} />;
    case 'readAloud':
      return <ReadAloudEx ex={ex} api={api} />;
    case 'tip':
      return <TipCard ex={ex} api={api} />;
    case 'pattern':
      return <PatternCard ex={ex} api={api} />;
    case 'say':
      return <SayEx ex={ex} api={api} />;
    case 'dialogue':
      return <DialogueEx ex={ex} api={api} />;
  }
}


/** "Bilal teaches you:" — shows which character is speaking. */
export function Speaker({ id, line }: { id?: string; line: string }) {
  const c = useCharacter(id);
  return (
    <div className="speaker">
      <span className="speaker-avatar" aria-hidden>
        {c.avatar}
      </span>
      <span>
        <strong>{c.name}</strong> <span className="muted">{line}</span>
      </span>
    </div>
  );
}

/** Leni explains a grammar or culture point, with an example from the lesson. */
export function TipCard({ ex, api }: { ex: Of<'tip'>; api: ExApi }) {
  const name = useName();
  const gender = useGender();
  useEffect(() => api.setCheck(null), []);
  const f = ex.example ? displayForm(ex.example, gender, name) : null;
  return (
    <div>
      <Kicker>How Urdu works</Kicker>
      <div className="tip-card">
        <div className="tip-head">
          <span aria-hidden>{TEACHER.avatar}</span> <strong>Leni explains</strong>
        </div>
        <p style={{ fontSize: '1.1rem', margin: '8px 0 0' }}>{ex.text}</p>
        {f && ex.example && (
          <div className="tip-example">
            <div className="small muted">For example:</div>
            <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(ex.example.en, name)} show={{ en: true, roman: true }} />
            <div style={{ marginTop: 6 }}>
              <PlayButtons item={{ urdu: f.urdu, audio: ex.example.audio, voice: api.host }} compact />
            </div>
            <WordBreakdown urdu={f.urdu} />
          </div>
        )}
      </div>
    </div>
  );
}
