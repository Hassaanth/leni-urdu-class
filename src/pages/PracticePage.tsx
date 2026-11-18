import { useMemo, useState } from 'react';
import { CardLink, PageHead } from '../components/common';
import { SessionRunner, type SessionSummary } from '../components/SessionRunner';
import { useName, useToday } from '../hooks';
import { buildMatchExercises, buildOrderExercises, buildReviewExercises, rng, shuffle } from '../lib/exercises';
import { dueQueue, weakest } from '../lib/srs';
import { href, navigate } from '../router';
import { useCourse } from '../state/course';
import { store, useProgress, useSettings } from '../state/store';

const MODES: Record<string, { title: string; icon: string; sub: string }> = {
  review: { title: 'Mixed review', icon: '🔁', sub: 'Due and difficult phrases, all exercise types' },
  flashcards: { title: 'Flashcards', icon: '🃏', sub: 'Flip, recall, rate yourself' },
  listening: { title: 'Listening drill', icon: '👂', sub: 'Hear Urdu, pick the meaning' },
  recall: { title: 'Write from memory', icon: '⌨️', sub: 'English → Roman Urdu' },
  match: { title: 'Matching game', icon: '🧩', sub: 'Pair meanings with phrases' },
  order: { title: 'Sentence builder', icon: '🧱', sub: 'Put words in the right order' },
};

function usePracticePool() {
  const { idx } = useCourse();
  const cards = useProgress((s) => s.cards);
  const today = useToday();
  return useMemo(() => {
    const all = Object.values(cards);
    const due = dueQueue(all, today).map((c) => c.id);
    const weak = weakest(all, 20).map((c) => c.id);
    const learned = all.map((c) => c.id);
    const fallback = idx.lessons.slice(0, 2).flatMap((l) => l.phrases.map((p) => p.id));
    const order = [...new Set([...due, ...weak, ...learned, ...(learned.length < 8 ? fallback : [])])];
    return { ids: order.filter((id) => idx.phraseById.has(id)), dueCount: due.length, learnedCount: learned.length };
  }, [cards, today, idx]);
}

export function PracticePage() {
  const pool = usePracticePool();
  return (
    <>
      <PageHead title="Practice" />
      {pool.learnedCount === 0 && (
        <div className="banner info">You haven't started a lesson yet, so practice uses phrases from the first lessons. Phrases you learn are added automatically.</div>
      )}
      <div className="card soft" style={{ marginBottom: 12 }}>
        <strong>{pool.dueCount ? `${pool.dueCount} phrase${pool.dueCount === 1 ? '' : 's'} due for review` : 'Nothing due right now'}</strong>
        <p className="small muted" style={{ margin: 0 }}>
          Review spacing grows each time you remember a phrase, and shrinks when you miss it. Microphone or recognition problems never count as mistakes.
        </p>
      </div>
      {Object.entries(MODES).map(([k, m]) => (
        <CardLink key={k} to={`/practice/${k}`} icon={m.icon} title={m.title} sub={m.sub} right={k === 'review' && pool.dueCount ? <span className="chip amber">{pool.dueCount}</span> : undefined} />
      ))}
      <h2>Speaking practice</h2>
      <CardLink to="/speak/game/memory" icon="🧠" accent title="Speak from memory" sub="See English, say the Urdu, check yourself" />
      <CardLink to="/speak/game/quick" icon="⚡" accent title="Quick response" sub="Answer spoken questions fast" />
      <CardLink to="/words" icon="📖" title="Vocabulary list" sub="Search every phrase and see its review schedule" />
    </>
  );
}

export function PracticeSessionPage({ mode }: { mode: string }) {
  const { idx } = useCourse();
  const settings = useSettings();
  const name = useName();
  const pool = usePracticePool();
  const [seed, setSeed] = useState(() => Date.now());
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [xpStart, setXpStart] = useState(() => store.getState().xp);
  const meta = MODES[mode];

  const exercises = useMemo(() => {
    const rand = rng(seed);
    const phrases = pool.ids.map((id) => idx.phraseById.get(id)!).filter(Boolean);
    const opts = { gender: settings.learnerGender, name, seed };
    switch (mode) {
      case 'match':
        return buildMatchExercises(shuffle(phrases.slice(0, 24), rand).slice(0, 12), opts);
      case 'order':
        return buildOrderExercises(shuffle(phrases.slice(0, 30), rand), opts).slice(0, 8);
      case 'flashcards':
      case 'listening':
      case 'recall':
        return buildReviewExercises(phrases.slice(0, 10), idx, { ...opts, mode });
      default:
        return buildReviewExercises(phrases.slice(0, 12), idx, { ...opts, mode: 'mixed' });
    }
    // Freeze the session once built.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, seed]);

  if (!meta) {
    return (
      <>
        <PageHead title="Practice" backTo="/practice" />
        <p>Unknown practice mode.</p>
      </>
    );
  }
  if (summary) {
    return (
      <>
        <div className="celebrate">
          <div className="big" aria-hidden>
            ✅
          </div>
          <h1>{meta.title} done</h1>
        </div>
        <div className="stat-row">
          <div className="stat">
            <b>+{store.getState().xp - xpStart}</b>
            <span>XP</span>
          </div>
          <div className="stat">
            <b>{Math.round(summary.accuracy * 100)}%</b>
            <span>First try</span>
          </div>
          <div className="stat">
            <b>{summary.practicedPhraseIds.length}</b>
            <span>Phrases</span>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          {summary.missedPhraseIds.length
            ? `${summary.missedPhraseIds.length} phrase${summary.missedPhraseIds.length === 1 ? '' : 's'} will come back sooner because you missed them.`
            : 'Everything recalled — those phrases will come back after a longer gap.'}
        </p>
        <div className="row" style={{ marginTop: 16 }}>
          <a className="btn" href={href('/practice')}>
            Practice menu
          </a>
          <button
            className="btn primary grow"
            onClick={() => {
              setXpStart(store.getState().xp);
              setSummary(null);
              setSeed(Date.now());
            }}
          >
            Another round
          </button>
        </div>
      </>
    );
  }
  if (exercises.length === 0) {
    return (
      <>
        <PageHead title={meta.title} backTo="/practice" />
        <p>There aren't enough suitable phrases for this mode yet. Complete a lesson or two first.</p>
        <a className="btn primary" href={href('/learn')}>
          Go to lessons
        </a>
      </>
    );
  }
  return <SessionRunner key={seed} title={meta.title} exercises={exercises} review onExit={() => navigate('/practice')} onFinish={setSummary} />;
}
