import { useMemo } from 'react';
import { CardLink, PageHead, ProgressBar } from '../components/common';
import { useToday } from '../hooks';
import { ACHIEVEMENTS } from '../lib/achievements';
import { lastNDays, longestStreak } from '../lib/dates';
import { isActiveDay, practiceStreak, speakingStreak } from '../lib/progress';
import { mastery, weakest } from '../lib/srs';
import { useCourse } from '../state/course';
import { useProgress } from '../state/store';

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
