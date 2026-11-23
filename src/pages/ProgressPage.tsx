import { useMemo } from 'react';
import { CardLink, PageHead, ProgressBar } from '../components/common';
import { useToday } from '../hooks';
import { ACHIEVEMENTS } from '../lib/achievements';
import { lastNDays, longestStreak } from '../lib/dates';
import { isActiveDay, practiceStreak, speakingStreak } from '../lib/progress';
import { mastery, weakest } from '../lib/srs';
import { useCourse } from '../state/course';
import { useProgress } from '../state/store';
import { currentLevel, PASS_MARK, SKILL_INFO } from '../lib/testing';
import type { Skill } from '../lib/progress';
import { dueQueue } from '../lib/srs';
import { TEACHER } from '../lib/teacher';

const dayLabel = (k: string) => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(k + 'T12:00:00').getDay()];

export function ProgressPage() {
  const { course, idx } = useCourse();
  const s = useProgress((st) => st);
  const today = useToday();
  const week = lastNDays(today, 7);

  const stats = useMemo(() => {
    const activeDays = Object.entries(s.days)
      .filter(([, d]) => isActiveDay(d))
      .map(([k]) => k);
    const speakDays = Object.entries(s.days)
      .filter(([, d]) => d.speakingAttempts > 0)
      .map(([k]) => k);
    const spokenWeek = new Set(week.flatMap((d) => s.days[d]?.spoken ?? []));
    const cards = Object.values(s.cards);
    const listenTotals = Object.values(s.days).reduce((a, d) => ({ ex: a.ex + d.exercises, ok: a.ok + d.correct }), { ex: 0, ok: 0 });
    // Phrases practised aloud on several separate days — a good sign of habit.
    const multiDay = Object.entries(s.speaking.byPhrase)
      .filter(([, v]) => v.days.length >= 3)
      .map(([, v]) => v.label);
    return {
      activeDays,
      speakDays,
      spokenWeek,
      cards,
      listenTotals,
      multiDay,
      byMastery: {
        learning: cards.filter((c) => ['new', 'learning'].includes(mastery(c))).length,
        familiar: cards.filter((c) => mastery(c) === 'familiar').length,
        strong: cards.filter((c) => ['strong', 'mastered'].includes(mastery(c))).length,
      },
    };
  }, [s, week]);

  const maxXp = Math.max(10, ...week.map((d) => s.days[d]?.xp ?? 0));
  const maxSpeak = Math.max(3, ...week.map((d) => s.days[d]?.speakingAttempts ?? 0));
  const weak = weakest(stats.cards, 5).map((c) => idx.phraseById.get(c.id)).filter(Boolean);
  const sp = s.speaking;
  const recognitionRate = sp.recognitionAttempts ? Math.round((sp.recognitionMatches / sp.recognitionAttempts) * 100) : null;
  const totalLessons = idx.lessons.length;
  const leastSpoken = Object.entries(sp.byPhrase)
    .filter(([k]) => idx.phraseById.has(k))
    .sort((a, b) => a[1].attempts - b[1].attempts)
    .slice(0, 3)
    .map(([, v]) => v.label);

  return (
    <>
      <PageHead title="Progress" backTo="/learn" />
      <div className="stat-row">
        <div className="stat">
          <b>{s.xp}</b>
          <span>Total XP</span>
        </div>
        <div className="stat">
          <b>{practiceStreak(s, today)}</b>
          <span>Day streak</span>
        </div>
        <div className="stat">
          <b>{longestStreak(stats.activeDays)}</b>
          <span>Best streak</span>
        </div>
      </div>

      <ReportCard />

      <h2>This week</h2>
      <div className="card">
        <div className="small muted">XP per day</div>
        <div className="bars" role="img" aria-label={`XP over the last 7 days: ${week.map((d) => `${dayLabel(d)} ${s.days[d]?.xp ?? 0}`).join(', ')}`}>
          {week.map((d) => (
            <div className="bar" key={d}>
              <span style={{ height: `${((s.days[d]?.xp ?? 0) / maxXp) * 100}%` }} />
              {dayLabel(d)}
            </div>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 14 }}>
          Speaking attempts per day
        </div>
        <div
          className="bars"
          role="img"
          aria-label={`Speaking attempts over the last 7 days: ${week.map((d) => `${dayLabel(d)} ${s.days[d]?.speakingAttempts ?? 0}`).join(', ')}`}
        >
          {week.map((d) => (
            <div className="bar speak" key={d}>
              <span style={{ height: `${((s.days[d]?.speakingAttempts ?? 0) / maxSpeak) * 100}%` }} />
              {dayLabel(d)}
            </div>
          ))}
        </div>
      </div>

      <h2>Speaking</h2>
      <div className="card stack">
        <p style={{ margin: 0 }}>
          🎙️ You practised <strong>{stats.spokenWeek.size}</strong> Urdu phrase{stats.spokenWeek.size === 1 ? '' : 's'} aloud this week, on{' '}
          <strong>{week.filter((d) => (s.days[d]?.speakingAttempts ?? 0) > 0).length}</strong> day(s). Speaking streak: <strong>{speakingStreak(s, today)}</strong>.
        </p>
        {stats.multiDay.length > 0 && (
          <p className="small" style={{ margin: 0 }}>
            You've practised {stats.multiDay.slice(0, 3).join(', ')} on three or more separate days.
          </p>
        )}
        <div className="small">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Speaking sessions</span>
            <strong>{sp.sessions}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Different phrases practised aloud</span>
            <strong>{Object.keys(sp.byPhrase).length}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Speech-recognition attempts</span>
            <strong>{sp.recognitionAttempts}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>…where the phrase was recognized</span>
            <strong>{recognitionRate === null ? '—' : `${sp.recognitionMatches} (${recognitionRate}%)`}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Technical recognition errors (not counted against you)</span>
            <strong>{sp.recognitionErrors}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Your self-checks: sounded right / need practice</span>
            <strong>
              {sp.selfGood} / {sp.selfRetry}
            </strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Verified pronunciation assessment</span>
            <strong>Not configured</strong>
          </div>
        </div>
        <p className="honesty" style={{ margin: 0 }}>
          These numbers describe practice, not fluency. "Recognized" means browser speech-to-text matched the phrase — it isn't a pronunciation score, and correct
          speech is sometimes not recognized.
        </p>
        {leastSpoken.length > 0 && <p className="small" style={{ margin: 0 }}>Try saying these again soon: {leastSpoken.join(' · ')}</p>}
      </div>

      <h2>Course & vocabulary</h2>
      <div className="card stack">
        <div>
          <div className="row small" style={{ justifyContent: 'space-between' }}>
            <span>Lessons completed</span>
            <strong>
              {Object.keys(s.lessons).length} / {totalLessons}
            </strong>
          </div>
          <ProgressBar value={Object.keys(s.lessons).length / totalLessons} label="Lessons completed" />
        </div>
        {course.levels.map((lvl) => {
          const ls = course.units.filter((u) => u.level === lvl.id).flatMap((u) => u.lessons);
          const d = ls.filter((l) => s.lessons[l.id]).length;
          return (
            <div key={lvl.id} className="row small" style={{ justifyContent: 'space-between' }}>
              <span>
                Level {lvl.id}: {lvl.title}
              </span>
              <span>
                {d}/{ls.length}
              </span>
            </div>
          );
        })}
        <div className="row small" style={{ justifyContent: 'space-between' }}>
          <span>Phrases: learning / familiar / strong</span>
          <strong>
            {stats.byMastery.learning} / {stats.byMastery.familiar} / {stats.byMastery.strong}
          </strong>
        </div>
        <div className="row small" style={{ justifyContent: 'space-between' }}>
          <span>Exercise answers right (all time)</span>
          <strong>
            {stats.listenTotals.ok} / {stats.listenTotals.ex}
          </strong>
        </div>
        <div className="row small" style={{ justifyContent: 'space-between' }}>
          <span>Conversations finished</span>
          <strong>
            {Object.keys(s.conversations).length} / {course.conversations.length}
          </strong>
        </div>
      </div>

      <h2>Areas to improve</h2>
      {weak.length ? (
        <div className="card">
          <p className="small muted" style={{ marginTop: 0 }}>
            Phrases you've missed most recently:
          </p>
          {weak.map((p) => (
            <div key={p!.id} className="small" lang="ur-Latn">
              • <strong>{p!.roman}</strong> <span className="muted">— {p!.en}</span>
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <CardLink to="/practice/review" icon="🔁" title="Review these now" />
          </div>
        </div>
      ) : (
        <p className="muted small">Nothing stands out yet — keep practising and we'll point out tricky phrases here.</p>
      )}

      <h2>Achievements</h2>
      <div className="grid-2">
        {ACHIEVEMENTS.map((a) => {
          const got = s.achievements[a.id];
          return (
            <div key={a.id} className="card" style={{ margin: 0, opacity: got ? 1 : 0.55 }}>
              <div style={{ fontSize: '1.6rem' }} aria-hidden>
                {got ? a.icon : '🔒'}
              </div>
              <strong>{a.title}</strong>
              <div className="small muted">{a.description}</div>
              {got && <div className="small">Earned {got}</div>}
            </div>
          );
        })}
      </div>

      <h2>Practice history</h2>
      <div className="card">
        {Object.keys(s.days).length === 0 && <p className="muted small">No practice yet.</p>}
        {Object.entries(s.days)
          .sort((a, b) => b[0].localeCompare(a[0]))
          .slice(0, 14)
          .map(([d, v]) => (
            <div key={d} className="row small" style={{ justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid var(--border)' }}>
              <span>{d}</span>
              <span className="muted">
                {Math.round(v.seconds / 60)} min · {v.xp} XP · {v.speakingAttempts} spoken · {v.lessons} lesson{v.lessons === 1 ? '' : 's'}
              </span>
            </div>
          ))}
      </div>
    </>
  );
}

/** Where the learner is, how strong each skill is, test results, and what to do next. */
function ReportCard() {
  const { course, idx } = useCourse();
  const s = useProgress((st) => st);
  const today = useToday();
  const level = currentLevel(s, course);
  const nextLvl = course.levels.find((l) => l.id === level + 1);
  const nextLessons = nextLvl ? course.units.filter((u) => u.level === nextLvl.id).flatMap((u) => u.lessons) : [];
  const nextDone = nextLessons.filter((l) => s.lessons[l.id]).length;
  const skills = (Object.entries(s.skills) as [Skill, { right: number; total: number }][]).filter(([, v]) => v.total > 0);
  const weak = skills.filter(([, v]) => v.total >= 4).sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total)[0];
  const due = dueQueue(Object.values(s.cards), today).length;
  const units = course.units.filter((u) => u.lessons.some((l) => s.lessons[l.id]));
  const untested = units.filter((u) => u.lessons.every((l) => s.lessons[l.id]) && !((s.tests[`unit:${u.id}`]?.best ?? 0) >= PASS_MARK));
  const todo: { to: string; icon: string; title: string; sub: string }[] = [];
  if (due) todo.push({ to: '/practice/review', icon: '🔁', title: `Review ${due} word${due === 1 ? '' : 's'}`, sub: 'Due now or missed recently' });
  if (weak && weak[1].right / weak[1].total < 0.85)
    todo.push({ to: SKILL_INFO[weak[0]].to, icon: '🎯', title: `Practise: ${SKILL_INFO[weak[0]].practise}`, sub: `Your weakest skill: ${SKILL_INFO[weak[0]].label.toLowerCase()}` });
  for (const u of untested.slice(0, 2)) todo.push({ to: `/test/unit/${u.id}`, icon: '📝', title: `Take the "${u.title}" test`, sub: 'You finished this unit — check what stuck' });
  const next = idx.lessons.find((l) => !s.lessons[l.id]);
  if (next) todo.push({ to: `/lesson/${next.id}`, icon: '➡️', title: `Next lesson: ${next.title}`, sub: idx.unitByLesson.get(next.id)?.title ?? '' });

  return (
    <>
      <h2>Your report card</h2>
      <div className="card stack">
        <div>
          <div className="small muted">Your level</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>
            {level ? `Level ${level}: ${course.levels.find((l) => l.id === level)?.title}` : 'Just getting started'}
          </div>
          {nextLvl && (
            <>
              <div className="small" style={{ margin: '4px 0' }}>
                Next: Level {nextLvl.id} — {nextLvl.title} ({nextDone}/{nextLessons.length} lessons)
              </div>
              <ProgressBar value={nextLessons.length ? nextDone / nextLessons.length : 0} label="Progress to next level" />
            </>
          )}
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>
            Your skills (right first time)
          </div>
          {skills.length === 0 && <p className="small muted">Finish a lesson to see how you're doing in each skill.</p>}
          {skills.map(([k, v]) => (
            <div key={k} style={{ marginBottom: 6 }}>
              <div className="row small" style={{ justifyContent: 'space-between' }}>
                <span>
                  {SKILL_INFO[k].label}
                  {weak && weak[0] === k && v.right / v.total < 0.85 ? ' — needs practice' : ''}
                </span>
                <strong>{Math.round((v.right / v.total) * 100)}%</strong>
              </div>
              <ProgressBar value={v.right / v.total} label={SKILL_INFO[k].label} />
            </div>
          ))}
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>
            Tests
          </div>
          {s.tests.placement && (
            <div className="row small" style={{ justifyContent: 'space-between' }}>
              <span>Placement test</span>
              <span>
                placed at Level {s.placement?.level ?? 0} · {Math.round(s.tests.placement.score * 100)}%
              </span>
            </div>
          )}
          {course.units
            .filter((u) => s.tests[`unit:${u.id}`])
            .map((u) => {
              const t = s.tests[`unit:${u.id}`];
              const best = t.best ?? t.score;
              return (
                <div key={u.id} className="row small" style={{ justifyContent: 'space-between' }}>
                  <span>{u.title}</span>
                  <span className={`chip ${best >= PASS_MARK ? 'green' : 'amber'}`}>
                    best {Math.round(best * 100)}%{best >= PASS_MARK ? ' ✓' : ''}
                  </span>
                </div>
              );
            })}
          <div className="row wrap" style={{ marginTop: 8 }}>
            <a className="btn small" href="#/test/placement">
              📝 {s.tests.placement ? 'Retake' : 'Take'} the placement test
            </a>
          </div>
        </div>
      </div>
      <div className="teacher" style={{ marginTop: 12 }}>
        <span className="t-avatar" aria-hidden>
          {TEACHER.avatar}
        </span>
        <div className="t-bubble">
          {todo.length ? "Here's what I'd do next:" : "You're all caught up — amazing work!"}
        </div>
      </div>
      {todo.slice(0, 4).map((t) => (
        <CardLink key={t.to} to={t.to} icon={t.icon} title={t.title} sub={t.sub} />
      ))}
    </>
  );
}
