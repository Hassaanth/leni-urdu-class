// Speaking games. All reward genuine attempts; none require a perfect transcription.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHead, PhraseText, PlayButtons, ProgressBar } from '../components/common';
import { IconPlay } from '../components/Icons';
import { SpeakPanel, type AttemptResult } from '../components/SpeakPanel';
import { useAudioState, useName, usePracticeTimer, useStopAudioOnUnmount, useToday } from '../hooks';
import type { CourseIndexes } from '../content/loader';
import { dateKey, diffDays, type DateKey } from '../lib/dates';
import { displayForm, rng, shuffle, speechTargets } from '../lib/exercises';
import { markDailyChallenge, recordAnswer } from '../lib/progress';
import { fillSlots } from '../lib/text';
import { audio } from '../services/audio';
import { recorderSupported, startRecording, type ActiveRecording } from '../services/recorder';
import { href } from '../router';
import { useCourse } from '../state/course';
import { store, useProgress, useSettings } from '../state/store';
import type { ConversationChoice, Course, Phrase } from '../types';
import { GAMES } from './SpeakPage';

export function dailyTheme(course: Course, today: DateKey) {
  const themes = course.speaking.dailyThemes;
  if (!themes.length) return null;
  return themes[Math.abs(diffDays('2024-01-01', today)) % themes.length];
}

function phrasePool(idx: CourseIndexes, n: number, seed: number): Phrase[] {
  const cards = store.getState().cards;
  const learned = Object.keys(cards)
    .map((id) => idx.phraseById.get(id))
    .filter((p): p is Phrase => !!p);
  const base = learned.length >= n ? learned : [...learned, ...idx.lessons.slice(0, 3).flatMap((l) => l.phrases)];
  const unique = [...new Map(base.map((p) => [p.id, p])).values()];
  return shuffle(unique, rng(seed)).slice(0, n);
}

export function SpeakGamePage({ game }: { game?: string }) {
  usePracticeTimer(true);
  useStopAudioOnUnmount();
  const meta = GAMES.find((g) => g.id === game) ?? (game === 'daily' ? { id: 'daily', icon: '⭐', title: 'Daily Speaking Challenge', sub: '' } : null);
  if (!meta) {
    return (
      <>
        <PageHead title="Game not found" backTo="/speak" />
      </>
    );
  }
  return (
    <>
      <PageHead title={meta.title} backTo="/speak" />
      {game === 'unlock' && <UnlockGame />}
      {game === 'three-try' && <ThreeTryGame />}
      {game === 'daily' && <DailyChallenge />}
      {game === 'memory' && <MemoryGame />}
      {game === 'quick' && <QuickResponse />}
      {game === 'shadow' && <Shadowing />}
      {game === 'response' && <ResponseChallenge />}
    </>
  );
}

function GameDone({ title, body, again }: { title: string; body: string; again: () => void }) {
  return (
    <div className="celebrate">
      <div className="big" aria-hidden>
        🎉
      </div>
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <a className="btn" href={href('/speak')}>
          Speak menu
        </a>
        <button className="btn primary" onClick={again}>
          Play again
        </button>
      </div>
    </div>
  );
}

// ---------- Say It to Unlock It ----------

function UnlockGame() {
  const { idx } = useCourse();
  const name = useName();
  const settings = useSettings();
  const [seed, setSeed] = useState(() => Date.now());
  const phrases = useMemo(() => phrasePool(idx, 6, seed), [idx, seed]);
  const [i, setI] = useState(0);
  const [unlocked, setUnlocked] = useState<Record<string, 'open' | 'star'>>({});
  if (i >= phrases.length)
    return (
      <GameDone
        title="All chests opened!"
        body={`You said ${Object.keys(unlocked).length} phrases aloud. ${Object.values(unlocked).filter((v) => v === 'star').length} were recognized by speech recognition.`}
        again={() => {
          setSeed(Date.now());
          setI(0);
          setUnlocked({});
        }}
      />
    );
  const p = phrases[i];
  const f = displayForm(p, settings.learnerGender, name);
  const state = unlocked[p.id];
  return (
    <>
      <p className="muted">Say each phrase out loud to open its chest. Any real attempt counts.</p>
      <div className="row wrap" style={{ marginBottom: 12 }} aria-label="Chests">
        {phrases.map((x, k) => (
          <span key={x.id} className={`chip ${unlocked[x.id] ? 'green' : k === i ? 'amber' : ''}`}>
            {unlocked[x.id] === 'star' ? '⭐' : unlocked[x.id] ? '🎁' : '🔒'} {k + 1}
          </span>
        ))}
      </div>
      <div className="phrase-card center">
        <div style={{ fontSize: '2.5rem' }} aria-hidden>
          {state === 'star' ? '⭐' : state ? '🎁' : '🔒'}
        </div>
        <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p.en, name)} show={{ roman: true }} size="lg" />
        {state && <p className="small" role="status">{state === 'star' ? 'Unlocked — and speech recognition recognized it!' : 'Unlocked! Good practice.'}</p>}
      </div>
      <SpeakPanel
        phraseKey={p.id}
        label={f.roman}
        targets={speechTargets(p)}
        model={{ urdu: f.urdu, audio: p.audio }}
        name={name}
        onAttempt={(r) => {
          if (r.outcome === 'error' || r.outcome === 'self-retry') return;
          setUnlocked((u) => ({ ...u, [p.id]: u[p.id] === 'star' || r.outcome === 'match' ? 'star' : 'open' }));
        }}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => setI(i + 1)}>
          Skip
        </button>
        <button className="btn primary grow" disabled={!state} onClick={() => setI(i + 1)}>
          Next chest
        </button>
      </div>
    </>
  );
}

// ---------- Three-Try Challenge ----------

function ThreeTryGame() {
  const { idx } = useCourse();
  const name = useName();
  const settings = useSettings();
  const [seed, setSeed] = useState(() => Date.now());
  const phrases = useMemo(() => phrasePool(idx, 5, seed).filter((p) => !p.slot), [idx, seed]);
  const [i, setI] = useState(0);
  const [tries, setTries] = useState<AttemptResult['outcome'][]>([]);
  if (i >= phrases.length)
    return (
      <GameDone
        title="Challenge complete"
        body="Three focused tries with listening in between is one of the best ways to improve. Come back tomorrow for a fresh set."
        again={() => {
          setSeed(Date.now());
          setI(0);
          setTries([]);
        }}
      />
    );
  const p = phrases[i];
  const f = displayForm(p, settings.learnerGender, name);
  const finished = tries.length >= 3 || tries.includes('match');
  return (
    <>
      <p className="muted">
        Phrase {i + 1} of {phrases.length}. You get three tries — listen to the model before each one.
      </p>
      <div className="phrase-card">
        <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p.en, name)} show={{ roman: true }} size="lg" />
      </div>
      {tries.length > 0 && !finished && (
        <div className="banner" role="status">
          Before try {tries.length + 1}: listen to the model once more, then speak.
        </div>
      )}
      <SpeakPanel
        phraseKey={p.id}
        label={f.roman}
        targets={speechTargets(p)}
        model={{ urdu: f.urdu, audio: p.audio }}
        name={name}
        maxAttempts={3}
        onAttempt={(r) => r.outcome !== 'error' && !r.outcome.startsWith('self') && setTries((t) => [...t, r.outcome])}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className={`btn grow ${finished ? 'primary' : ''}`}
          onClick={() => {
            setI(i + 1);
            setTries([]);
          }}
        >
          {finished ? 'Next phrase' : 'Skip phrase'}
        </button>
      </div>
    </>
  );
}

// ---------- Daily Speaking Challenge ----------

function DailyChallenge() {
  const { course, idx } = useCourse();
  const name = useName();
  const settings = useSettings();
  const today = useToday();
  const theme = dailyTheme(course, today);
  const phrases = (theme?.phraseIds ?? []).map((id) => idx.phraseById.get(id)).filter((p): p is Phrase => !!p);
  const done = useProgress((s) => s.dailyChallenge[today]) ?? [];
  const [i, setI] = useState(() => Math.min(done.length, Math.max(0, phrases.length - 1)));
  if (!theme || phrases.length === 0) return <p>No daily challenge is configured in the course content.</p>;
  const total = phrases.length;
  const p = phrases[Math.min(i, total - 1)];
  const f = displayForm(p, settings.learnerGender, name);
  const allDone = done.length >= total;
  return (
    <>
      <p className="muted">
        Today's theme: <strong>{theme.title}</strong>. Say five useful phrases aloud. A new theme appears tomorrow.
      </p>
      <ProgressBar value={done.length / total} label="Daily challenge progress" />
      <p className="small muted">
        {done.length}/{total} said aloud {allDone ? '— challenge complete! ⭐' : ''}
      </p>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {phrases.map((x, k) => (
          <button key={x.id} className={`chip ${done.includes(x.id) ? 'green' : k === i ? 'amber' : ''}`} onClick={() => setI(k)} aria-label={`Phrase ${k + 1}${done.includes(x.id) ? ', done' : ''}`}>
            {done.includes(x.id) ? '✓' : k + 1}
          </button>
        ))}
      </div>
      <div className="phrase-card">
        <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p.en, name)} show={{ roman: true }} size="lg" />
        {p.note && <div className="note">{p.note}</div>}
      </div>
      <SpeakPanel
        phraseKey={p.id}
        label={f.roman}
        targets={speechTargets(p)}
        model={{ urdu: f.urdu, audio: p.audio }}
        name={name}
        onAttempt={(r) => {
          if (r.outcome === 'error') return;
          let finished = false;
          store.update((s) => {
            const res = markDailyChallenge(s, p.id, dateKey(), total);
            finished = res.finished && !(s.dailyChallenge[dateKey()]?.length >= total);
            return res.state;
          });
          if (finished) store.toasts.push({ icon: '⭐', title: 'Daily Speaking Challenge complete!', body: 'Bonus XP earned. See you tomorrow.' });
        }}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
          Previous
        </button>
        <button className="btn primary grow" disabled={i >= total - 1} onClick={() => setI(i + 1)}>
          Next phrase
        </button>
      </div>
    </>
  );
}

// ---------- Speak From Memory ----------

function MemoryGame() {
  const { idx } = useCourse();
  const name = useName();
  const settings = useSettings();
  const [seed, setSeed] = useState(() => Date.now());
  const phrases = useMemo(() => phrasePool(idx, 8, seed), [idx, seed]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'ask' | 'reveal' | 'rated'>('ask');
  const [recognized, setRecognized] = useState(false);
  const [score, setScore] = useState({ yes: 0, no: 0 });
  if (i >= phrases.length)
    return (
      <GameDone
        title="Memory round done"
        body={`You remembered ${score.yes} of ${score.yes + score.no}. Phrases you missed will come up sooner in reviews.`}
        again={() => {
          setSeed(Date.now());
          setI(0);
          setScore({ yes: 0, no: 0 });
          setPhase('ask');
        }}
      />
    );
  const p = phrases[i];
  const f = displayForm(p, settings.learnerGender, name);
  const rate = (correct: boolean) => {
    // A learner's own judgement after seeing the answer is a confirmed result, so it updates review scheduling.
    store.update((s) => recordAnswer(s, { phraseIds: [p.id], correct, firstTry: true, review: true }, dateKey()));
    setScore((sc) => (correct ? { ...sc, yes: sc.yes + 1 } : { ...sc, no: sc.no + 1 }));
    setPhase('rated');
  };
  return (
    <>
      <p className="muted">
        {i + 1} of {phrases.length}. Say it in Urdu from memory, then check.
      </p>
      <div className="phrase-card center">
        <div className="small muted">How do you say…</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800 }} lang="en">
          {fillSlots(p.en, name)}
        </div>
        {phase !== 'ask' && (
          <div style={{ marginTop: 12 }}>
            <PhraseText roman={f.roman} urdu={f.urdu} show={{ roman: true, en: false }} />
            <PlayButtons item={{ urdu: f.urdu, audio: p.audio }} compact autoPlay />
          </div>
        )}
      </div>
      {phase === 'ask' && (
        <SpeakPanel
          phraseKey={p.id}
          label={f.roman}
          targets={speechTargets(p)}
          model={null}
          showModelButtons={false}
          name={name}
          hideExpected
          onAttempt={(r) => {
            if (r.outcome === 'error') return;
            setRecognized(r.outcome === 'match');
            setPhase('reveal');
          }}
        />
      )}
      {phase === 'ask' && (
        <button className="btn block" style={{ marginTop: 10 }} onClick={() => setPhase('reveal')}>
          Show the answer
        </button>
      )}
      {phase === 'reveal' && (
        <div className="card" style={{ marginTop: 12 }}>
          {recognized && <p className="small">✅ Speech recognition recognized the phrase.</p>}
          <strong>Did you remember it?</strong>
          <div className="grid-2" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => rate(false)}>
              Not quite
            </button>
            <button className="btn primary" onClick={() => rate(true)}>
              Yes, I did
            </button>
          </div>
        </div>
      )}
      {phase === 'rated' && (
        <button
          className="btn primary block"
          style={{ marginTop: 12 }}
          onClick={() => {
            setI(i + 1);
            setPhase('ask');
            setRecognized(false);
          }}
        >
          Next
        </button>
      )}
    </>
  );
}

// ---------- Quick Response ----------

function QuickResponse() {
  const { course } = useCourse();
  const name = useName();
  const { voice } = useAudioState();
  const [seed, setSeed] = useState(() => Date.now());
  const qs = useMemo(() => shuffle(course.speaking.questions, rng(seed)).slice(0, 6), [course, seed]);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(8);
  const [revealQ, setRevealQ] = useState(false);
  const q = qs[i];
  useEffect(() => {
    if (!q) return;
    setLeft(8);
    setRevealQ(audio.sourceFor({ urdu: q.question.urdu }) === 'none');
    void audio.play({ urdu: q.question.urdu });
    const t = setInterval(() => setLeft((l) => (l > 0 ? l - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [q, voice]);
  if (!q)
    return (
      <GameDone
        title="Quick round done"
        body="Answering without preparing is how real conversations feel. Speed comes with repetition."
        again={() => {
          setSeed(Date.now());
          setI(0);
        }}
      />
    );
  return (
    <>
      <p className="muted">
        Question {i + 1} of {qs.length}. Listen and answer before the timer runs out — no reading first!
      </p>
      <div className="phrase-card center">
        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: left <= 3 ? 'var(--rec)' : 'var(--primary)' }} aria-live="off">
          {left}s
        </div>
        {left === 0 && <p className="small">Time! Still answer — speed comes with practice.</p>}
        <button className="btn small" onClick={() => void audio.play({ urdu: q.question.urdu })}>
          <IconPlay /> Hear again
        </button>
        {revealQ ? (
          <div style={{ marginTop: 8 }}>
            <PhraseText roman={q.question.roman} urdu={q.question.urdu} en={q.question.en} show={{ en: true, roman: true }} />
          </div>
        ) : (
          <button className="btn small ghost" onClick={() => setRevealQ(true)}>
            Show question text
          </button>
        )}
      </div>
      <SpeakPanel phraseKey={q.id} label={q.question.roman} targets={q.answers} model={null} name={name} hideExpected />
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => setI(i + 1)}>
        Next question
      </button>
    </>
  );
}

// ---------- Shadowing ----------

function Shadowing() {
  const { course } = useCourse();
  useAudioState(); // re-render when audio becomes available
  const passages = course.speaking.passages;
  const [pid, setPid] = useState(passages[0]?.id);
  const [gap, setGap] = useState(1);
  const [running, setRunning] = useState(false);
  const [line, setLine] = useState(-1);
  const [turn, setTurn] = useState<'model' | 'you' | null>(null);
  const [recordIt, setRecordIt] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const stopRef = useRef(false);
  const recRef = useRef<ActiveRecording | null>(null);
  const passage = passages.find((p) => p.id === pid);
  useEffect(() => () => {
    stopRef.current = true;
    recRef.current?.cancel();
  }, []);
  useEffect(() => () => void (blobUrl && URL.revokeObjectURL(blobUrl)), [blobUrl]);
  if (!passage) return <p>No passages available.</p>;

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const run = async () => {
    stopRef.current = false;
    setRunning(true);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    if (recordIt && recorderSupported()) {
      try {
        recRef.current = await startRecording(180000);
      } catch {
        recRef.current = null;
      }
    }
    for (let k = 0; k < passage.lines.length; k++) {
      if (stopRef.current) break;
      setLine(k);
      setTurn('model');
      const l = passage.lines[k];
      const r = await audio.play({ urdu: l.urdu });
      if (r === 'interrupted' || stopRef.current) break;
      if (r !== 'played') await wait(Math.max(1500, l.roman.length * 70)); // read-along timing without audio
      setTurn('you');
      await wait(Math.max(1500, l.roman.length * 75) * gap);
    }
    setTurn(null);
    setRunning(false);
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      const blob = await rec.stop();
      if (blob) setBlobUrl(URL.createObjectURL(blob));
    }
  };
  const stop = () => {
    stopRef.current = true;
    audio.stop();
  };
  return (
    <>
      <p className="muted">The model says a line, then it's your turn to repeat it in the gap. Try to match the rhythm, not just the words.</p>
      {audio.sourceFor(passage.lines[0]) === 'none' && <div className="banner">No Urdu voice on this device, so this runs as timed read-along: read each line, then repeat it from memory in the gap.</div>}
      <div className="card soft stack">
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span>Passage</span>
          <select className="search" style={{ maxWidth: 220 }} value={pid} disabled={running} onChange={(e) => setPid(e.target.value)}>
            {passages.map((p) => (
              <option key={p.id} value={p.id}>
                L{p.level}: {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span>Your-turn gap</span>
          <select className="search" style={{ maxWidth: 220 }} value={gap} disabled={running} onChange={(e) => setGap(Number(e.target.value))}>
            <option value={0.7}>Short</option>
            <option value={1}>Normal</option>
            <option value={1.5}>Long</option>
          </select>
        </label>
        {recorderSupported() && (
          <label className="row" style={{ justifyContent: 'space-between' }}>
            <span>Record my shadowing (stays on this device)</span>
            <input type="checkbox" className="switch" checked={recordIt} disabled={running} onChange={(e) => setRecordIt(e.target.checked)} />
          </label>
        )}
      </div>
      <ol className="lesson-list">
        {passage.lines.map((l, k) => (
          <li
            key={k}
            className="vocab-item"
            style={k === line ? { background: turn === 'you' ? 'var(--rec-soft)' : 'var(--primary-soft)', borderRadius: 12, padding: '10px' } : undefined}
            aria-current={k === line ? 'step' : undefined}
          >
            <div className="grow">
              <div className="roman" lang="ur-Latn">
                {l.roman}
              </div>
              <div className="small muted">{l.en}</div>
            </div>
            {k === line && <span className={`chip ${turn === 'you' ? 'red' : 'teal'}`}>{turn === 'you' ? '🎤 Your turn' : '🔊 Listen'}</span>}
          </li>
        ))}
      </ol>
      <div className="row" style={{ marginTop: 12 }}>
        {running ? (
          <button className="btn danger grow" onClick={stop}>
            Stop
          </button>
        ) : (
          <button className="btn primary grow" onClick={run}>
            {line >= 0 ? 'Shadow again' : 'Start shadowing'}
          </button>
        )}
      </div>
      {running && recordIt && (
        <p className="live-banner" role="status" style={{ marginTop: 10 }}>
          <span className="rec-dot" /> Recording on this device
        </p>
      )}
      {blobUrl && (
        <div className="result-card">
          <strong>Your shadowing recording</strong>
          <audio controls src={blobUrl} style={{ width: '100%', marginTop: 8 }} />
          <button
            className="btn small ghost"
            onClick={() => {
              URL.revokeObjectURL(blobUrl);
              setBlobUrl(null);
            }}
          >
            Discard recording
          </button>
          <p className="honesty">Kept only in this tab's memory. Nothing is uploaded or saved.</p>
        </div>
      )}
    </>
  );
}

// ---------- Conversation Response Challenge ----------

function ResponseChallenge() {
  const { course } = useCourse();
  const name = useName();
  const [seed, setSeed] = useState(() => Date.now());
  const items = useMemo(() => {
    const all = course.conversations.flatMap((c) =>
      c.nodes.filter((n) => n.choices?.some((ch) => ch.quality === 'best') && !n.end).map((n) => ({ scenario: c, node: n })),
    );
    return shuffle(all, rng(seed)).slice(0, 6);
  }, [course, seed]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<ConversationChoice | null>(null);
  const [heardMatch, setHeardMatch] = useState(false);
  const item = items[i];
  useEffect(() => {
    if (item) void audio.play({ urdu: item.node.line.urdu, voice: item.scenario.partner.character });
  }, [item]);
  if (!item)
    return (
      <GameDone
        title="Nice responding!"
        body="Replying to real lines is the bridge to full conversations. Try a complete role-play next."
        again={() => {
          setSeed(Date.now());
          setI(0);
          setPicked(null);
        }}
      />
    );
  const good = item.node.choices!.filter((c) => c.quality !== 'wrong');
  return (
    <>
      <p className="muted">
        {i + 1} of {items.length} · <em>{item.scenario.title}</em>: {item.scenario.context}
      </p>
      <div className="bubble them" style={{ maxWidth: '100%' }}>
        <div className="who">{item.scenario.partner.name}</div>
        <PhraseText roman={fillSlots(item.node.line.roman, name)} urdu={item.node.line.urdu} en={item.node.line.en} />
        <button className="btn small ghost" onClick={() => void audio.play({ urdu: item.node.line.urdu, voice: item.scenario.partner.character })}>
          <IconPlay /> Play
        </button>
      </div>
      {!picked && (
        <SpeakPanel
          phraseKey={`${item.scenario.id}:${item.node.id}`}
          label={item.node.line.roman}
          targets={good.map((c) => ({ roman: c.roman, urdu: c.urdu }))}
          model={null}
          name={name}
          hideExpected
          prompt="Reply out loud."
          onAttempt={(r) => {
            if (r.outcome === 'match' && r.assessment) {
              const ch = good.find((c) => c.roman === r.assessment!.target.roman);
              if (ch) {
                setHeardMatch(true);
                setPicked(ch);
              }
            }
          }}
        />
      )}
      {!picked && (
        <div className="card" style={{ marginTop: 12 }}>
          <strong>Which reply did you say (or mean)?</strong>
          <div className="options" style={{ marginTop: 8 }}>
            {item.node.choices!.map((c, k) => (
              <button key={k} className="option" onClick={() => setPicked(c)}>
                <span className="roman" lang="ur-Latn">
                  {fillSlots(c.roman, name)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {picked && (
        <div className={`result-card ${picked.quality === 'best' ? 'match' : picked.quality === 'ok' ? 'partial' : ''}`} role="status" style={{ marginTop: 12 }}>
          {heardMatch && <p className="small">We recognized your reply.</p>}
          <div className="r-title">{picked.quality === 'best' ? 'Great reply!' : picked.quality === 'ok' ? 'That works.' : "That doesn't fit here."}</div>
          <p className="small">{picked.feedback}</p>
          <PhraseText roman={fillSlots(picked.roman, name)} urdu={fillSlots(picked.urdu, name)} en={fillSlots(picked.en, name)} size="sm" />
          <button
            className="btn primary block"
            style={{ marginTop: 10 }}
            onClick={() => {
              setPicked(null);
              setHeardMatch(false);
              if (picked.quality !== 'wrong') setI(i + 1);
            }}
          >
            {picked.quality === 'wrong' ? 'Try again' : 'Next line'}
          </button>
        </div>
      )}
    </>
  );
}
