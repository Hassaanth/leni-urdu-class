import { useState } from 'react';
import { CardLink, ProgressBar, Segmented } from '../components/common';
import { IconChart, IconFlame, IconLogo, IconSettings } from '../components/Icons';
import { useToday } from '../hooks';
import type { CourseIndexes } from '../content/loader';
import { goalProgress, practiceStreak, speakingStreak, type ProgressState, type Settings } from '../lib/progress';
import { dueQueue } from '../lib/srs';
import { href, navigate } from '../router';
import { useCourse } from '../state/course';
import { store, useProgress } from '../state/store';
import { dailyTheme } from './SpeakGames';

export function nextLesson(s: ProgressState, idx: CourseIndexes) {
  return idx.lessons.find((l) => !s.lessons[l.id]) ?? null;
}

function Onboarding() {
  const settings = useProgress((s) => s.settings);
  const [name, setName] = useState(settings.learnerName);
  const [gender, setGender] = useState<Settings['learnerGender']>(settings.learnerGender);
  const [goal, setGoal] = useState<Settings['dailyGoalMinutes']>(settings.dailyGoalMinutes);
  const save = () =>
    {
    store.update((s) => ({ ...s, settings: { ...s.settings, learnerName: name.trim(), learnerGender: gender, dailyGoalMinutes: goal, onboarded: true } }));
    navigate('/start');
  };
  return (
    <section className="card" aria-labelledby="welcome">
      <h2 id="welcome" style={{ marginTop: 0 }}>
        Khush aamdeed! Welcome 👋
      </h2>
      <p className="muted">
        Leni Urdu Class teaches everyday spoken Urdu with Roman Urdu first, so you can start speaking before you read the Urdu script. Three quick choices:
      </p>
      <div className="stack">
        <label className="stack" style={{ display: 'block' }}>
          <strong>Your first name (optional)</strong>
          <input className="search" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sara" autoComplete="given-name" maxLength={30} />
          <span className="small muted">Used to practise "Mera naam … hai". Stored only on this device.</span>
        </label>
        <div>
          <strong>Which verb endings should we show you first?</strong>
          <p className="small muted" style={{ margin: '2px 0 6px' }}>
            Some Urdu verbs change with the speaker's gender: a man says "main thak gaya hoon", a woman says "main thak gayi hoon". You'll learn both.
          </p>
          <Segmented
            label="Verb endings"
            value={gender}
            onChange={setGender}
            options={[
              { value: 'masculine', label: 'Masculine (-a)' },
              { value: 'feminine', label: 'Feminine (-i)' },
            ]}
          />
        </div>
        <div>
          <strong>Daily practice goal</strong>
          <div style={{ marginTop: 6 }}>
            <Segmented
              label="Daily goal"
              value={goal}
              onChange={setGoal}
              options={[5, 10, 15, 20].map((m) => ({ value: m as Settings['dailyGoalMinutes'], label: `${m} min` }))}
            />
          </div>
        </div>
        <button className="btn primary block" onClick={save}>
          Let's start
        </button>
      </div>
    </section>
  );
}

export function LearnPage() {
  const { course, idx } = useCourse();
  const s = useProgress((st) => st);
  const today = useToday();
  const goal = goalProgress(s, today);
  const streak = practiceStreak(s, today);
  const speakStreak = speakingStreak(s, today);
  const next = nextLesson(s, idx);
  const due = dueQueue(Object.values(s.cards), today).length;
  const theme = dailyTheme(course, today);
  const challengeDone = (s.dailyChallenge[today] ?? []).length;
  const totalLessons = idx.lessons.length;
  const doneLessons = Object.keys(s.lessons).filter((id) => idx.lessonById.has(id)).length;

  return (
    <>
      <header className="page-head">
        <div className="brand">
          <span className="brand-mark">
            <IconLogo width={22} height={22} />
          </span>
          Leni Urdu Class
        </div>
        <div className="head-actions">
          <span className="chip amber" title="Practice streak" aria-label={`${streak} day practice streak`}>
            <IconFlame width={16} height={16} /> {streak}
          </span>
          <a className="icon-btn" href={href('/progress')} aria-label="Progress">
            <IconChart />
          </a>
          <a className="icon-btn" href={href('/settings')} aria-label="Settings">
            <IconSettings />
          </a>
        </div>
      </header>

      {!s.settings.onboarded && <Onboarding />}
      {s.settings.onboarded && doneLessons < 3 && (
        <CardLink to="/start" icon="👋" accent title="New to Urdu? Start here" sub="How to read Roman Urdu, key sounds, and your first five phrases" />
      )}

      <section className="card hero" aria-label="Today">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Today's goal</strong>
          <span className="small">
            {goal.minutes} / {goal.goal} min {goal.done ? '✓' : ''}
          </span>
        </div>
        <div style={{ margin: '8px 0 14px' }}>
          <ProgressBar value={goal.minutes / goal.goal} label="Daily goal progress" />
        </div>
        {next ? (
          <>
            <div className="small muted">Next lesson · {idx.unitByLesson.get(next.id)?.title}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, margin: '2px 0 12px' }}>{next.title}</div>
            <a className="btn accent block" href={href(`/lesson/${next.id}`)}>
              {doneLessons === 0 ? 'Start your first lesson' : 'Continue learning'}
            </a>
          </>
        ) : (
          <>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, margin: '2px 0 12px' }}>You've finished every lesson! 🎉</div>
            <a className="btn accent block" href={href('/talk')}>
              Practise conversations
            </a>
          </>
        )}
      </section>

      <div className="stat-row" style={{ marginTop: 12 }}>
        <div className="stat">
          <b>{s.xp}</b>
          <span>Total XP</span>
        </div>
        <div className="stat">
          <b>
            {doneLessons}/{totalLessons}
          </b>
          <span>Lessons</span>
        </div>
        <div className="stat">
          <b>{speakStreak}</b>
          <span>Speaking streak</span>
        </div>
      </div>

      <h2>Speak today</h2>
      <CardLink
        to="/speak/game/daily"
        icon="⭐"
        accent
        title={`Daily Speaking Challenge: ${theme?.title ?? 'Mixed'}`}
        sub={challengeDone >= 5 ? 'Done for today — nice work!' : `${challengeDone}/5 phrases said aloud`}
      />
      <CardLink to="/speak/repeat" icon="🎙️" title="Repeat after me" sub="Listen to a phrase, then say it" />
      {due > 0 && <CardLink to="/practice/review" icon="🔁" title={`${due} phrase${due === 1 ? '' : 's'} due for review`} sub="Spaced review keeps words fresh" />}

      <h2 id="course">Course</h2>
      {course.levels.map((lvl) => {
        const units = course.units.filter((u) => u.level === lvl.id);
        if (!units.length) return null;
        return (
          <section key={lvl.id} aria-labelledby={`lvl-${lvl.id}`}>
            <div className="level-head">
              <h2 id={`lvl-${lvl.id}`}>
                Level {lvl.id}: {lvl.title}
              </h2>
            </div>
            <p className="small muted" style={{ marginTop: 0 }}>
              🎯 Speaking goal: {lvl.speakingGoal}
            </p>
            {units.map((u) => (
              <div className="card unit" key={u.id}>
                <h3>{u.title}</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {u.description}
                </p>
                <ul className="lesson-list">
                  {u.lessons.map((l) => {
                    const done = !!s.lessons[l.id];
                    const current = next?.id === l.id;
                    return (
                      <li key={l.id}>
                        <a className="lesson-item" href={href(`/lesson/${l.id}`)}>
                          <span className={`lesson-dot ${done ? 'done' : current ? 'current' : ''}`} aria-hidden>
                            {done ? '✓' : idx.lessons.indexOf(l) + 1}
                          </span>
                          <span className="grow">
                            <strong>{l.title}</strong>
                            <div className="small muted">
                              {l.phrases.length} phrases{done ? ` · best ${Math.round(s.lessons[l.id].bestAccuracy * 100)}% first-try` : ''}
                              {current ? ' · up next' : ''}
                            </div>
                          </span>
                          <span className="sr-only">{done ? 'Completed' : current ? 'Next lesson' : 'Not started'}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}
