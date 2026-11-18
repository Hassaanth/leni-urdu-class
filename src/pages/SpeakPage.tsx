import { useEffect, useMemo, useState } from 'react';
import { CardLink, PageHead, PhraseText } from '../components/common';
import { GenderBox, QaModePicker, ReadAloudEx, SpokenQAEx, type ExApi } from '../components/exercises';
import { SpeakPanel } from '../components/SpeakPanel';
import { useAudioState, useName, usePracticeTimer, useStopAudioOnUnmount, useToday } from '../hooks';
import { lastNDays } from '../lib/dates';
import { displayForm, speechTargets } from '../lib/exercises';
import { speakingStreak } from '../lib/progress';
import { fillSlots } from '../lib/text';
import { recorderSupported } from '../services/recorder';
import { micPermissionState, recognitionCapabilities } from '../services/speech';
import { href, navigate } from '../router';
import { useCourse } from '../state/course';
import { useProgress, useSettings } from '../state/store';
import { WordBreakdown } from '../components/WordBreakdown';

/** What speaking features this device supports, stated plainly. */
export function SpeakingCapabilities({ detailed }: { detailed?: boolean }) {
  const caps = useMemo(() => recognitionCapabilities(), []);
  const canRecord = useMemo(() => recorderSupported(), []);
  const { voice, ttsSupported } = useAudioState();
  const settings = useSettings();
  const [perm, setPerm] = useState<string>('unknown');
  useEffect(() => {
    void micPermissionState().then(setPerm);
  }, []);
  const rows: [string, string, boolean][] = [
    [
      'Speech recognition',
      caps.supported
        ? settings.recognitionConsent === 'granted'
          ? 'Available and allowed'
          : settings.recognitionConsent === 'declined'
            ? 'Available, turned off by you'
            : 'Available — we ask first'
        : 'Not available in this browser',
      caps.supported && settings.recognitionConsent !== 'declined',
    ],
    ['Record & compare (local)', canRecord ? 'Available' : 'Not available', canRecord],
    ['Urdu model voice', voice ? `${voice.name}` : ttsSupported ? 'No Urdu voice installed' : 'Not supported', !!voice],
  ];
  if (detailed) rows.push(['Microphone permission', perm === 'granted' ? 'Allowed' : perm === 'denied' ? 'Blocked' : perm === 'prompt' ? 'Will ask when you start' : 'Unknown until first use', perm !== 'denied']);
  return (
    <div className="card soft">
      <strong>On this device</strong>
      <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
        {rows.map(([k, v, ok]) => (
          <li key={k} className="row small" style={{ justifyContent: 'space-between', padding: '3px 0' }}>
            <span>{k}</span>
            <span className={`chip ${ok ? 'green' : ''}`}>{v}</span>
          </li>
        ))}
      </ul>
      {!caps.supported && <p className="small muted" style={{ margin: '6px 0 0' }}>{caps.reason}</p>}
      {!detailed && (
        <a className="small" href={href('/settings#speaking')}>
          Microphone & privacy settings
        </a>
      )}
    </div>
  );
}

export function SpeakPage() {
  const s = useProgress((st) => st);
  const today = useToday();
  const week = lastNDays(today, 7);
  const phrasesThisWeek = new Set(week.flatMap((d) => s.days[d]?.spoken ?? [])).size;
  const streak = speakingStreak(s, today);
  return (
    <>
      <PageHead title="Speak" />
      <div className="card hero">
        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{phrasesThisWeek ? `You practised ${phrasesThisWeek} Urdu phrase${phrasesThisWeek === 1 ? '' : 's'} aloud this week.` : 'Say your first Urdu phrase aloud today.'}</div>
        <p className="small muted" style={{ margin: '4px 0 12px' }}>
          {streak ? `Speaking streak: ${streak} day${streak === 1 ? '' : 's'}. ` : ''}Every genuine attempt counts — it doesn't need to be perfect.
        </p>
        <a className="btn accent block" href={href('/speak/game/daily')}>
          ⭐ Daily Speaking Challenge
        </a>
      </div>
      <div style={{ marginTop: 12 }}>
        <SpeakingCapabilities />
      </div>

      <h2>Core practice</h2>
      <CardLink to="/speak/repeat" icon="🎙️" title="Repeat after me" sub="Listen, say it, compare — phrase by phrase" />
      <CardLink to="/speak/pronunciation" icon="👄" title="Pronunciation drills" sub="Tricky sounds, vowels, rhythm, connected speech" />
      <CardLink to="/speak/qa" icon="❓" title="Spoken questions" sub="Hear a question, answer out loud" />
      <CardLink to="/speak/read" icon="📜" title="Read aloud" sub="Short passages, sentence by sentence" />

      <h2>Speaking games</h2>
      <div className="grid-2">
        {GAMES.map((g) => (
          <a key={g.id} className="card-link" href={href(`/speak/game/${g.id}`)}>
            <span className="icon-bubble accent" aria-hidden>
              {g.icon}
            </span>
            <span>
              <strong>{g.title}</strong>
              <div className="small muted">{g.sub}</div>
            </span>
          </a>
        ))}
      </div>
    </>
  );
}

export const GAMES = [
  { id: 'unlock', icon: '🔓', title: 'Say It to Unlock It', sub: 'Speak to open each reward' },
  { id: 'three-try', icon: '3️⃣', title: 'Three-Try Challenge', sub: 'Three attempts, model in between' },
  { id: 'memory', icon: '🧠', title: 'Speak From Memory', sub: 'English → say the Urdu' },
  { id: 'quick', icon: '⚡', title: 'Quick Response', sub: 'Answer before the timer ends' },
  { id: 'shadow', icon: '👥', title: 'Shadowing', sub: 'Repeat along with the model' },
  { id: 'response', icon: '💬', title: 'Conversation Response', sub: 'Reply to a character' },
];

// ---------- Repeat after me ----------

export function RepeatPage({ lessonId }: { lessonId?: string }) {
  const { idx } = useCourse();
  usePracticeTimer(true);
  useStopAudioOnUnmount();
  const name = useName();
  const settings = useSettings();
  const lessons = useProgress((s) => s.lessons);
  const lesson = lessonId ? idx.lessonById.get(lessonId) : undefined;
  const [i, setI] = useState(0);
  const [showEn, setShowEn] = useState(settings.showEnglish);

  if (!lesson) {
    const started = idx.lessons.filter((l) => lessons[l.id]);
    const suggested = started.length ? started : idx.lessons.slice(0, 3);
    return (
      <>
        <PageHead title="Repeat after me" backTo="/speak" />
        <p className="muted">Pick a set of phrases. You'll hear each one, say it, and compare.</p>
        <h2>{started.length ? 'Lessons you have done' : 'Good places to start'}</h2>
        {suggested.map((l) => (
          <CardLink key={l.id} to={`/speak/repeat/${l.id}`} icon="🎙️" title={l.title} sub={`${l.phrases.length} phrases`} />
        ))}
        <details className="disclosure">
          <summary>All lessons</summary>
          {idx.lessons.map((l) => (
            <CardLink key={l.id} to={`/speak/repeat/${l.id}`} icon="•" title={l.title} sub={idx.unitByLesson.get(l.id)?.title} />
          ))}
        </details>
      </>
    );
  }
  const p = lesson.phrases[Math.min(i, lesson.phrases.length - 1)];
  const f = displayForm(p, settings.learnerGender, name);
  return (
    <>
      <PageHead title="Repeat after me" backTo="/speak/repeat" />
      <p className="small muted" style={{ marginTop: -8 }}>
        {lesson.title} · phrase {i + 1} of {lesson.phrases.length}
      </p>
      <div className="phrase-card">
        <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p.en, name)} show={{ en: showEn, roman: true }} size="lg" />
        <button className="btn small ghost" aria-pressed={showEn} onClick={() => setShowEn(!showEn)}>
          {showEn ? 'Hide English' : 'Show English'}
        </button>
        {p.note && <div className="note">{p.note}</div>}
        {p.genderVariants && <GenderBox phrase={p} name={name} />}
        <WordBreakdown urdu={f.urdu} />
      </div>
      <SpeakPanel phraseKey={p.id} label={f.roman} targets={speechTargets(p)} model={{ urdu: f.urdu, audio: p.audio }} name={name} />
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
          Previous
        </button>
        {i < lesson.phrases.length - 1 ? (
          <button className="btn primary grow" onClick={() => setI(i + 1)}>
            Next phrase
          </button>
        ) : (
          <button className="btn primary grow" onClick={() => navigate('/speak')}>
            Finish
          </button>
        )}
      </div>
    </>
  );
}

// ---------- Spoken Q&A (standalone) ----------

const noopApi = (onAttempt?: () => void): ExApi => ({
  locked: false,
  answer: () => undefined,
  setCheck: () => undefined,
  noteAttempt: () => onAttempt?.(),
});

export function SpokenQAPage() {
  const { course } = useCourse();
  usePracticeTimer(true);
  useStopAudioOnUnmount();
  const qs = course.speaking.questions;
  const [i, setI] = useState(0);
  const q = qs[i % qs.length];
  return (
    <>
      <PageHead title="Spoken questions" backTo="/speak" />
      <div className="card soft small" style={{ marginBottom: 12 }}>
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <span>
            <strong>Beginner</strong>: English + hints. <strong>Middle</strong>: audio first, help on request. <strong>Challenge</strong>: no text until you ask.
          </span>
          <QaModePicker />
        </div>
      </div>
      <SpokenQAEx key={q.id} ex={{ kind: 'spokenQA', id: q.id, question: q }} api={noopApi()} />
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
          Previous
        </button>
        <button className="btn primary grow" onClick={() => setI(i + 1)}>
          Next question ({(i % qs.length) + 1}/{qs.length})
        </button>
      </div>
    </>
  );
}

// ---------- Read aloud ----------

export function ReadAloudListPage() {
  const { course } = useCourse();
  return (
    <>
      <PageHead title="Read aloud" backTo="/speak" />
      <p className="muted">Short passages that grow longer by level. Roman Urdu is shown first; reveal the Urdu script when you're ready.</p>
      {course.speaking.passages.map((p) => (
        <CardLink key={p.id} to={`/speak/read/${p.id}`} icon="📜" title={p.title} sub={`Level ${p.level} · ${p.lines.length} lines`} />
      ))}
    </>
  );
}

export function ReadAloudPage({ id }: { id: string }) {
  const { course } = useCourse();
  usePracticeTimer(true);
  useStopAudioOnUnmount();
  const passage = course.speaking.passages.find((p) => p.id === id);
  const [answered, setAnswered] = useState<boolean | null>(null);
  if (!passage) {
    return (
      <>
        <PageHead title="Read aloud" backTo="/speak/read" />
        <p>Passage not found.</p>
      </>
    );
  }
  const api: ExApi = { ...noopApi(), answer: (correct) => setAnswered(correct) };
  return (
    <>
      <PageHead title="Read aloud" backTo="/speak/read" />
      <ReadAloudEx ex={{ kind: 'readAloud', id: passage.id, passage }} api={api} />
      {answered !== null && (
        <div className={`banner ${answered ? 'info' : ''}`} role="status" style={{ marginTop: 12 }}>
          {answered ? '✅ Correct! ' : '❌ Not quite. '}
          {passage.question?.explain}
        </div>
      )}
    </>
  );
}
