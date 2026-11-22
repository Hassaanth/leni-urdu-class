import { useMemo, useState } from 'react';
import { CardLink, PageHead, PhraseText, PlayButtons } from '../components/common';
import { SessionRunner, type SessionSummary } from '../components/SessionRunner';
import { useName } from '../hooks';
import { dateKey } from '../lib/dates';
import { buildLessonExercises, buildPatternLesson, displayForm } from '../lib/exercises';
import { completeLesson, weakestSkill } from '../lib/progress';
import { FINALE, TEACHER } from '../lib/teacher';
import { audio } from '../services/audio';
import { useCharacter } from '../state/course';
import { dueQueue } from '../lib/srs';
import type { Phrase } from '../types';
import { fillSlots } from '../lib/text';
import { href, navigate } from '../router';
import { useCourse } from '../state/course';
import { store, useProgress, useSettings } from '../state/store';
import { nextLesson } from './LearnPage';

export function LessonPage({ id }: { id?: string }) {
  const { course, idx } = useCourse();
  const lesson = id ? idx.lessonById.get(id) : undefined;
  const settings = useSettings();
  const name = useName();
  const record = useProgress((s) => (id ? s.lessons[id] : undefined));
  const [phase, setPhase] = useState<'intro' | 'session' | 'results'>('intro');
  const hostChar = useCharacter(lesson?.dialogue?.partner.character ?? (lesson ? idx.unitByLesson.get(lesson.id)?.host : undefined));
  const [seed, setSeed] = useState(() => Date.now());
  const [summary, setSummary] = useState<(SessionSummary & { xp: number }) | null>(null);
  const [xpAtStart, setXpAtStart] = useState(0);

  const exercises = useMemo(() => {
    if (!lesson) return [];
    const st = store.getState();
    const due = dueQueue(Object.values(st.cards), dateKey())
      .map((c) => idx.phraseById.get(c.id))
      .filter((p): p is Phrase => !!p && !lesson.phrases.includes(p) && !(lesson.builds ?? []).includes(p));
    const opts = { gender: settings.learnerGender, name, seed, style: settings.learnStyle, pace: settings.pace, weakSkill: weakestSkill(st) };
    if (lesson.kind === 'build') {
      // Warm-up: earlier sentences that are due or were missed; otherwise the previous lesson's sentences.
      const earlier = idx.lessons.slice(0, idx.lessons.indexOf(lesson)).filter((l) => l.kind === 'build');
      const dueBuilds = due.filter((p) => idx.buildIds.has(p.id));
      const prev = earlier.length ? (earlier[earlier.length - 1].builds ?? []) : [];
      const previousBuilds = [...dueBuilds, ...prev.filter((b) => !b.slot && !dueBuilds.includes(b))];
      return buildPatternLesson(lesson, idx, { ...opts, previousBuilds });
    }
    return buildLessonExercises(lesson, course, idx, { ...opts, warmup: due });
  },
    // Rebuild only when a new attempt starts, not when settings change mid-lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lesson, seed],
  );

  if (!lesson) {
    return (
      <>
        <PageHead title="Lesson not found" backTo="/learn" />
        <p>This lesson doesn't exist (it may have been removed from the course files).</p>
        <a className="btn primary" href={href('/learn')}>
          Back to the course
        </a>
      </>
    );
  }
  const unit = idx.unitByLesson.get(lesson.id);
  const host = lesson.dialogue?.partner.character ?? unit?.host ?? 'leni';
  const scenario = lesson.roleplayId ? course.conversations.find((c) => c.id === lesson.roleplayId) : undefined;

  if (phase === 'session') {
    return (
      <SessionRunner
        title={lesson.title}
        host={host}
        exercises={exercises}
        onExit={() => setPhase('intro')}
        onFinish={(sum) => {
          let earned = 0;
          store.update((s) => {
            const r = completeLesson(s, lesson.id, sum.accuracy, dateKey());
            earned = r.xpEarned;
            return r.state;
          });
          setSummary({ ...sum, xp: store.getState().xp - xpAtStart || earned });
          setPhase('results');
          setTimeout(() => void audio.play({ urdu: FINALE.urdu, voice: host }), 400);
        }}
      />
    );
  }

  if (phase === 'results' && summary) {
    const nxt = nextLesson(store.getState(), idx);
    const missed = summary.missedPhraseIds.map((pid) => idx.phraseById.get(pid)).filter(Boolean);
    const pct = Math.round(summary.accuracy * 100);
    return (
      <>
        <div className="celebrate">
          <div className="big" aria-hidden>
            {hostChar.avatar}
          </div>
          <div className="stars" aria-label={`${starsFor(summary.accuracy)} of 3 stars`}>
            {'★'.repeat(starsFor(summary.accuracy))}
            <span className="muted">{'☆'.repeat(3 - starsFor(summary.accuracy))}</span>
          </div>
          <h1 style={{ marginBottom: 4 }}>Lesson complete!</h1>
          <p style={{ margin: 0 }}>
            <strong>{hostChar.name}:</strong> "{FINALE.roman}" <span className="muted">— {FINALE.en}</span>
          </p>
          <p className="muted">{lesson.title}</p>
        </div>
        <div className="stat-row">
          <div className="stat">
            <b>+{summary.xp}</b>
            <span>XP earned</span>
          </div>
          <div className="stat">
            <b>{pct}%</b>
            <span>Right first try</span>
          </div>
          <div className="stat">
            <b>{summary.speakingAttempts}</b>
            <span>Spoken attempts</span>
          </div>
        </div>

        <h2>Key phrases to remember</h2>
        <div className="card">
          {lesson.phrases.slice(0, 6).map((p) => {
            const f = displayForm(p, settings.learnerGender, name);
            return (
              <div key={p.id} className="vocab-item">
                <div className="grow">
                  <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p.en, name)} size="sm" />
                </div>
                <PlayButtons item={{ urdu: f.urdu, audio: p.audio }} compact />
              </div>
            );
          })}
        </div>

        <div className="teacher" style={{ marginTop: 18 }}>
          <span className="t-avatar" aria-hidden>
            {TEACHER.avatar}
          </span>
          <div className="t-bubble">
            {pct < 60 ? (
              <>
                That was a tricky one — completely normal at this stage. Let's go over it again at a gentler pace, with smaller steps.
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn small primary"
                    onClick={() => {
                      store.update((st) => ({ ...st, settings: { ...st.settings, pace: 'relaxed' } }));
                      setSeed(Date.now());
                      setXpAtStart(store.getState().xp);
                      setPhase('session');
                    }}
                  >
                    Redo it gently
                  </button>
                </div>
              </>
            ) : pct >= 95 && settings.pace !== 'fast' ? (
              <>
                Shabash! You made that look easy. Want bigger steps next time?
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn small"
                    onClick={() => store.update((st) => ({ ...st, settings: { ...st.settings, pace: st.settings.pace === 'relaxed' ? 'steady' : 'fast' } }))}
                  >
                    Yes, speed up
                  </button>
                </div>
              </>
            ) : (
              <>Well done! Say today's phrases out loud a few more times later — that's what makes them stick.</>
            )}
          </div>
        </div>

        <h2>What next?</h2>
        {missed.length > 0 && (
          <p className="small muted">
            You found these tricky: {missed.map((p) => fillSlots(p!.roman, name)).join(' · ')}. They'll come back in your reviews.
          </p>
        )}
        {summary.speakingAttempts === 0 && <CardLink to={`/speak/repeat/${lesson.id}`} icon="🎙️" accent title="Practise speaking these phrases" sub="You skipped the speaking parts — try them now" />}
        {scenario && <CardLink to={`/talk/${scenario.id}`} icon={scenario.emoji} title={`Role-play: ${scenario.title}`} sub="Use what you learned in a conversation" />}
        {nxt && <CardLink to={`/lesson/${nxt.id}`} icon="➡️" title={`Next lesson: ${nxt.title}`} sub={idx.unitByLesson.get(nxt.id)?.title} />}
        <div className="row" style={{ marginTop: 16 }}>
          <button
            className="btn"
            onClick={() => {
              setSeed(Date.now());
              setXpAtStart(store.getState().xp);
              setPhase('session');
            }}
          >
            Redo lesson
          </button>
          <button className="btn primary grow" onClick={() => navigate('/learn')}>
            Back to course
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title={lesson.title} backTo="/learn" />
      <p className="small muted" style={{ marginTop: -8 }}>
        Level {unit?.level} · {unit?.title}
        {record ? ` · completed ${record.times}×` : ''}
      </p>
      <div className="card">
        <strong>🎯 Goal</strong>
        <p style={{ margin: '4px 0 0' }}>{lesson.objective}</p>
      </div>
      {lesson.tips && lesson.tips.length > 0 && (
        <>
          <h2>Before you start</h2>
          <ul className="card" style={{ paddingLeft: 32 }}>
            {lesson.tips.map((t, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {t}
              </li>
            ))}
          </ul>
        </>
      )}
      {lesson.pattern && (
        <>
          <h2>The pattern you'll master</h2>
          <div className="pattern-card">
            <div className="roman" lang="ur-Latn" style={{ fontSize: '1.3rem' }}>
              {lesson.pattern.frame.roman}
            </div>
            <div className="en">{lesson.pattern.frame.en}</div>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            You'll use it to build {lesson.builds?.length ?? 0} different sentences — first with word tiles, then from memory.
          </p>
        </>
      )}
      <h2>{lesson.kind === 'build' ? 'New words' : "You'll learn"}</h2>
      <div className="card">
        {lesson.phrases.map((p) => {
          const f = displayForm(p, settings.learnerGender, name);
          return (
            <div key={p.id} className="vocab-item">
              <div className="grow">
                <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p.en, name)} size="sm" />
              </div>
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Includes listening, matching, word order, typing and speaking. Speaking steps can always be skipped — nothing needs to be perfect.
      </p>
      <div style={{ position: 'sticky', bottom: 'calc(var(--nav-h) + var(--safe-b) + 10px)', marginTop: 12 }}>
        <button
          className="btn primary block"
          onClick={() => {
            setSeed(Date.now());
            setXpAtStart(store.getState().xp);
            setPhase('session');
          }}
        >
          {record ? 'Practise again' : 'Start lesson'}
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <CardLink to={`/speak/repeat/${lesson.id}`} icon="🎙️" title="Speaking only" sub="Repeat-after-me with this lesson's phrases" />
        {scenario && <CardLink to={`/talk/${scenario.id}`} icon={scenario.emoji} title={`Role-play: ${scenario.title}`} />}
      </div>
    </>
  );
}

/** 3 stars = 90%+ right first time, 2 = 60%+, otherwise 1 for finishing. */
export function starsFor(accuracy: number): number {
  return accuracy >= 0.9 ? 3 : accuracy >= 0.6 ? 2 : 1;
}
