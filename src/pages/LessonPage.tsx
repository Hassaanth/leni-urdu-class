import { useMemo, useState } from 'react';
import { CardLink, PageHead, PhraseText, PlayButtons } from '../components/common';
import { SessionRunner, type SessionSummary } from '../components/SessionRunner';
import { useName } from '../hooks';
import { dateKey } from '../lib/dates';
import { buildLessonExercises, displayForm } from '../lib/exercises';
import { completeLesson, weakestSkill } from '../lib/progress';
import { TEACHER } from '../lib/teacher';
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
  const [seed, setSeed] = useState(() => Date.now());
  const [summary, setSummary] = useState<(SessionSummary & { xp: number }) | null>(null);
  const [xpAtStart, setXpAtStart] = useState(0);

  const exercises = useMemo(
    () => (lesson ? buildLessonExercises(lesson, course, idx, {
            gender: settings.learnerGender,
            name,
            seed,
            style: settings.learnStyle,
            pace: settings.pace,
            weakSkill: weakestSkill(store.getState()),
            warmup: dueQueue(Object.values(store.getState().cards), dateKey())
              .map((c) => idx.phraseById.get(c.id))
              .filter((p): p is Phrase => !!p && !lesson.phrases.includes(p)),
          }) : []),
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
  const scenario = lesson.roleplayId ? course.conversations.find((c) => c.id === lesson.roleplayId) : undefined;

  if (phase === 'session') {
    return (
      <SessionRunner
        title={lesson.title}
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
            {pct >= 90 ? '🏆' : pct >= 60 ? '🎉' : '💪'}
          </div>
          <h1 style={{ marginBottom: 4 }}>Lesson complete!</h1>
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
      <h2>You'll learn</h2>
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
