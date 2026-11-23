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
import { starsFor } from './LessonPage';
import { useCharacter } from '../state/course';
import type { Unit } from '../types';

export function nextLesson(s: ProgressState, idx: CourseIndexes) {
  return idx.lessons.find((l) => !s.lessons[l.id]) ?? null;
}

function Onboarding() {
  const settings = useProgress((s) => s.settings);
  const [name, setName] = useState(settings.learnerName);
  const [gender, setGender] = useState<Settings['learnerGender']>(settings.learnerGender);
  const [goal, setGoal] = useState<Settings['dailyGoalMinutes']>(settings.dailyGoalMinutes);
  const [style, setStyle] = useState<Settings['learnStyle']>(settings.learnStyle);
  const [pace, setPace] = useState<Settings['pace']>(settings.pace);
  const [why, setWhy] = useState<Settings['goal']>(settings.goal);
  const save = () =>
    {
    store.update((s) => ({ ...s, settings: { ...s.settings, learnerName: name.trim(), learnerGender: gender, dailyGoalMinutes: goal, learnStyle: style, pace, goal: why, onboarded: true } }));
    navigate('/start');
  };
  return (
    <section className="card" aria-labelledby="welcome">
      <h2 id="welcome" style={{ marginTop: 0 }}>
        Khush aamdeed! Welcome 👋
      </h2>
      <p className="muted">
        Leni Urdu Class teaches everyday spoken Urdu with Roman Urdu first, so you can start speaking before you read the Urdu script. A few quick questions so I can teach you the way you learn best:
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
        <ProfileQuestions style={style} setStyle={setStyle} pace={pace} setPace={setPace} why={why} setWhy={setWhy} />
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
      {s.settings.onboarded && !s.placement && doneLessons < 5 && (
        <CardLink to="/test/placement" icon="📝" title="Already know some Urdu?" sub="Take the placement test to find your level and skip what you know" />
      )}
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
      {s.settings.onboarded && (
        <CardLink
          to={`/talk/${GOAL_PICKS[s.settings.goal].talk}`}
          icon="🎯"
          title={`For your goal: ${GOAL_PICKS[s.settings.goal].label}`}
          sub="A real conversation you'll actually use"
        />
      )}
      {due > 0 && <CardLink to="/practice/review" icon="🔁" title={`${due} phrase${due === 1 ? '' : 's'} due for review`} sub="Spaced review keeps words fresh" />}

      <h2 id="course">{course.story?.title ?? 'Course'}</h2>
      {course.story && (
        <p className="small muted" style={{ marginTop: -4 }}>
          {course.story.text}
        </p>
      )}
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
                <ChapterHeader unit={u} />
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
                              {done ? (
                                <span className="lesson-stars" aria-label={`${starsFor(s.lessons[l.id].bestAccuracy)} stars`}>
                                  {'★'.repeat(starsFor(s.lessons[l.id].bestAccuracy))}
                                  {'☆'.repeat(3 - starsFor(s.lessons[l.id].bestAccuracy))}
                                </span>
                              ) : (
                                `${l.phrases.length} phrases`
                              )}
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

export function ProfileQuestions(p: {
  style: Settings['learnStyle'];
  setStyle: (v: Settings['learnStyle']) => void;
  pace: Settings['pace'];
  setPace: (v: Settings['pace']) => void;
  why: Settings['goal'];
  setWhy: (v: Settings['goal']) => void;
}) {
  return (
    <>
      <div>
        <strong>How do you pick up new things best?</strong>
        <p className="small muted" style={{ margin: '2px 0 6px' }}>
          I'll change the order of each lesson to suit you.
        </p>
        <Segmented
          label="Learning style"
          value={p.style}
          onChange={p.setStyle}
          options={[
            { value: 'listen', label: '👂 Hearing it' },
            { value: 'see', label: '👀 Seeing it' },
            { value: 'speak', label: '🗣️ Saying it' },
          ]}
        />
      </div>
      <div>
        <strong>What pace suits you?</strong>
        <p className="small muted" style={{ margin: '2px 0 6px' }}>
          Gentle: 2 new phrases at a time with extra practice. Fast: 4 at a time with more typing.
        </p>
        <Segmented
          label="Pace"
          value={p.pace}
          onChange={p.setPace}
          options={[
            { value: 'relaxed', label: 'Gentle' },
            { value: 'steady', label: 'Steady' },
            { value: 'fast', label: 'Fast' },
          ]}
        />
      </div>
      <div>
        <strong>Why are you learning Urdu?</strong>
        <div style={{ marginTop: 6 }}>
          <Segmented
            label="Goal"
            value={p.why}
            onChange={p.setWhy}
            options={[
              { value: 'family', label: 'Family' },
              { value: 'friends', label: 'Friends' },
              { value: 'travel', label: 'Travel' },
              { value: 'work', label: 'Work' },
              { value: 'curious', label: 'Curious' },
            ]}
          />
        </div>
      </div>
    </>
  );
}

/** Lessons and role-plays that matter most for each goal. */
export const GOAL_PICKS: Record<Settings['goal'], { lesson: string; talk: string; label: string }> = {
  family: { lesson: 'l3-family', talk: 'c-relatives', label: 'talking with family' },
  friends: { lesson: 'l6-casual', talk: 'c-friends', label: 'chatting with friends' },
  travel: { lesson: 'l4-directions', talk: 'c-directions', label: 'getting around' },
  work: { lesson: 'l7-phone-work', talk: 'c-phone', label: 'work and phone calls' },
  curious: { lesson: 'l1-greetings', talk: 'c-first-meeting', label: 'first conversations' },
};

function ChapterHeader({ unit }: { unit: Unit }) {
  const host = useCharacter(unit.host);
  const test = useProgress((s) => s.tests[`unit:${unit.id}`]);
  return (
    <>
      <div className="chapter">
        <span className="chapter-avatar" aria-hidden>
          {host.avatar}
        </span>
        <div className="grow">
          {unit.chapter && <div className="small" style={{ fontWeight: 800, color: 'var(--accent)' }}>{unit.chapter}</div>}
          <h3 style={{ margin: 0 }}>{unit.title}</h3>
          <div className="small muted">with {host.name}, {host.role}</div>
        </div>
      </div>
      <p className="small" style={{ margin: '0 0 8px' }}>
        {unit.story ?? unit.description}
      </p>
      <div className="row wrap">
        {unit.guide && unit.guide.length > 0 && (
          <a className="btn small" href={href(`/guide/${unit.id}`)}>
            📖 Guidebook
          </a>
        )}
        <a className="btn small" href={href(`/test/unit/${unit.id}`)}>
          📝 Unit test{test ? ` · best ${Math.round((test.best ?? test.score) * 100)}%` : ''}
        </a>
        {test && (test.best ?? test.score) >= 0.8 && <span className="chip green">Passed</span>}
      </div>
    </>
  );
}
