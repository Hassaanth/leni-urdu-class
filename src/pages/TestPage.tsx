// Placement test ("Where am I?") and unit tests, with a report: score, skills, and what to practise.
import { useMemo, useState } from 'react';
import { CardLink, PageHead, PlayButtons, ProgressBar } from '../components/common';
import { SessionRunner, type SessionSummary } from '../components/SessionRunner';
import { useName } from '../hooks';
import { dateKey } from '../lib/dates';
import { displayForm } from '../lib/exercises';
import type { Skill } from '../lib/progress';
import { buildTestExercises, PASS_MARK, placementStages, recordTest, resultFrom, SKILL_INFO, testOut, unitItems, type TestResult } from '../lib/testing';
import { TEACHER } from '../lib/teacher';
import { fillSlots } from '../lib/text';
import { href, navigate } from '../router';
import { useCourse } from '../state/course';
import { store, useSettings } from '../state/store';

export function TestPage({ kind, id }: { kind?: string; id?: string }) {
  if (kind === 'placement') return <PlacementTest />;
  if (kind === 'unit' && id) return <UnitTest unitId={id} />;
  return <PageHead title="Test not found" backTo="/progress" />;
}

function SkillBars({ skills }: { skills: TestResult['skills'] }) {
  const entries = (Object.entries(skills) as [Skill, { right: number; total: number }][]).filter(([, v]) => v.total > 0);
  if (!entries.length) return null;
  return (
    <div className="stack">
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="row small" style={{ justifyContent: 'space-between' }}>
            <span>{SKILL_INFO[k].label}</span>
            <strong>
              {v.right}/{v.total}
            </strong>
          </div>
          <ProgressBar value={v.right / v.total} label={SKILL_INFO[k].label} />
        </div>
      ))}
    </div>
  );
}

/** Weakest skill in this result, if clearly weaker than the rest. */
function weakSkillOf(skills: TestResult['skills']): Skill | null {
  let worst: Skill | null = null;
  let rate = PASS_MARK;
  for (const [k, v] of Object.entries(skills) as [Skill, { right: number; total: number }][]) {
    if (v.total >= 2 && v.right / v.total < rate) {
      worst = k;
      rate = v.right / v.total;
    }
  }
  return worst;
}

function MissedList({ ids }: { ids: string[] }) {
  const { idx } = useCourse();
  const settings = useSettings();
  const name = useName();
  const items = ids.map((i) => idx.phraseById.get(i)).filter((p) => !!p);
  if (!items.length) return null;
  return (
    <div className="card" style={{ padding: '4px 16px' }}>
      {items.map((p) => {
        const f = displayForm(p!, settings.learnerGender, name);
        return (
          <div key={p!.id} className="vocab-item">
            <div className="grow">
              <strong lang="ur-Latn">{f.roman}</strong> <span className="muted">— {fillSlots(p!.en, name)}</span>
            </div>
            <PlayButtons item={{ urdu: f.urdu }} compact />
          </div>
        );
      })}
    </div>
  );
}

function Report({ r, title, children }: { r: TestResult; title: string; children?: React.ReactNode }) {
  const weak = weakSkillOf(r.skills);
  const pct = Math.round(r.score * 100);
  return (
    <>
      <div className="celebrate">
        <div className="big" aria-hidden>
          {r.passed ? '🏅' : '📘'}
        </div>
        <h1 style={{ marginBottom: 4 }}>{title}</h1>
        <div style={{ fontSize: '2.4rem', fontWeight: 900, color: r.passed ? 'var(--primary)' : 'var(--accent)' }}>{pct}%</div>
        <p className="muted" style={{ margin: 0 }}>
          {r.right} of {r.total} right · pass mark {Math.round(PASS_MARK * 100)}%
        </p>
      </div>
      <div className="teacher">
        <span className="t-avatar" aria-hidden>
          {TEACHER.avatar}
        </span>
        <div className="t-bubble">
          {r.passed
            ? weak
              ? `Great result! Your weakest area is "${SKILL_INFO[weak].label.toLowerCase()}" — a little practice there will make you even stronger.`
              : 'Excellent — you know this material well. Keep going!'
            : weak
              ? `Not quite there yet, and that's fine — that's what tests are for. Focus on "${SKILL_INFO[weak].label.toLowerCase()}" and review the words below, then try again.`
              : "Not quite there yet — review the words below and try again. They've been added to your reviews."}
        </div>
      </div>
      <h2>How you did in each skill</h2>
      <div className="card">
        <SkillBars skills={r.skills} />
      </div>
      {r.missed.length > 0 && (
        <>
          <h2>Practise these</h2>
          <p className="small muted" style={{ marginTop: -4 }}>
            You missed these. They now come first in your reviews.
          </p>
          <MissedList ids={r.missed} />
        </>
      )}
      <h2>What next?</h2>
      {r.missed.length > 0 && <CardLink to="/practice/review" icon="🔁" accent title="Review what you missed" sub="Missed words come first" />}
      {weak && <CardLink to={SKILL_INFO[weak].to} icon="🎯" title={`Practise: ${SKILL_INFO[weak].practise}`} sub={SKILL_INFO[weak].label} />}
      {children}
    </>
  );
}

// ---------- Unit test ----------

function UnitTest({ unitId }: { unitId: string }) {
  const { course } = useCourse();
  const settings = useSettings();
  const name = useName();
  const unit = course.units.find((u) => u.id === unitId);
  const [phase, setPhase] = useState<'intro' | 'test' | 'done'>('intro');
  const [seed, setSeed] = useState(() => Date.now());
  const [result, setResult] = useState<TestResult | null>(null);
  const exercises = useMemo(
    () =>
      unit
        ? buildTestExercises(unitItems(unit), { n: 10, seed, gender: settings.learnerGender, name, allowTyping: unit.level >= 2, prefix: `test-${unit.id}` })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unit, seed],
  );
  if (!unit) return <PageHead title="Unit not found" backTo="/learn" />;
  const testId = `unit:${unit.id}`;
  if (phase === 'test') {
    return (
      <SessionRunner
        key={seed}
        title={`${unit.title} test`}
        exercises={exercises}
        test
        host={unit.host}
        onExit={() => setPhase('intro')}
        onFinish={(sum: SessionSummary) => {
          const r = resultFrom(sum, dateKey());
          store.update((s) => recordTest(s, testId, r));
          setResult(r);
          setPhase('done');
        }}
      />
    );
  }
  if (phase === 'done' && result) {
    return (
      <Report r={result} title={result.passed ? `${unit.title}: passed!` : `${unit.title}: keep going`}>
        <div className="row" style={{ marginTop: 12 }}>
          <a className="btn" href={href('/learn')}>
            Back to lessons
          </a>
          <button
            className="btn primary grow"
            onClick={() => {
              setSeed(Date.now());
              setPhase('test');
            }}
          >
            Retake test
          </button>
        </div>
      </Report>
    );
  }
  const prev = store.getState().tests[testId];
  return (
    <>
      <PageHead title="Unit test" backTo="/learn" />
      <div className="card">
        <div className="small" style={{ fontWeight: 800, color: 'var(--accent)' }}>
          {unit.chapter}
        </div>
        <h2 style={{ margin: '2px 0 6px' }}>{unit.title}</h2>
        <p className="small muted" style={{ margin: 0 }}>
          10 questions on this unit: listening, meanings, choosing the right Urdu
          {unit.level >= 2 ? ', typing' : ''}
          {unit.lessons.some((l) => l.builds?.length) ? ' and building sentences' : ''}. No hints and no second chances — so you see what you really know. Pass mark:{' '}
          {Math.round(PASS_MARK * 100)}%.
        </p>
        {prev && (
          <p className="small" style={{ margin: '8px 0 0' }}>
            Last time: <strong>{Math.round(prev.score * 100)}%</strong> · best {Math.round((prev.best ?? prev.score) * 100)}%
          </p>
        )}
      </div>
      <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => setPhase('test')}>
        Start the test
      </button>
    </>
  );
}

// ---------- Placement test ----------

function PlacementTest() {
  const { course, idx } = useCourse();
  const settings = useSettings();
  const name = useName();
  const stages = useMemo(() => placementStages(course), [course]);
  const [phase, setPhase] = useState<'intro' | 'test' | 'between' | 'done'>('intro');
  const [stage, setStage] = useState(0);
  const [seed] = useState(() => Date.now());
  const [passedLevel, setPassedLevel] = useState(0);
  const [last, setLast] = useState<TestResult | null>(null);
  const [totals, setTotals] = useState<TestResult | null>(null);
  const PER_STAGE = 6;

  const current = stages[stage];
  const exercises = useMemo(
    () =>
      current
        ? buildTestExercises(current.items, { n: PER_STAGE, seed: seed + stage, gender: settings.learnerGender, name, allowTyping: current.level >= 2, prefix: `place-${current.level}` })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, seed],
  );

  const merge = (a: TestResult | null, b: TestResult): TestResult => {
    if (!a) return b;
    const skills = { ...a.skills };
    for (const [k, v] of Object.entries(b.skills) as [Skill, { right: number; total: number }][]) {
      const t = skills[k] ?? { right: 0, total: 0 };
      skills[k] = { right: t.right + v.right, total: t.total + v.total };
    }
    const right = a.right + b.right;
    const total = a.total + b.total;
    return { ...b, right, total, score: total ? right / total : 0, skills, missed: [...a.missed, ...b.missed] };
  };

  const finish = (lvl: number, all: TestResult) => {
    store.update((s) => recordTest({ ...s, placement: { date: dateKey(), level: lvl } }, 'placement', { ...all, passed: lvl > 0 }));
    setPassedLevel(lvl);
    setTotals(all);
    setPhase('done');
  };

  if (phase === 'test' && current) {
    return (
      <SessionRunner
        key={stage}
        title={`Placement test · ${current.title}`}
        exercises={exercises}
        test
        onExit={() => navigate('/learn')}
        onFinish={(sum) => {
          const r = resultFrom(sum, dateKey());
          const all = merge(totals, r);
          setTotals(all);
          setLast(r);
          if (r.passed && stage + 1 < stages.length) {
            setPassedLevel(current.level);
            setPhase('between');
          } else finish(r.passed ? current.level : stage > 0 ? stages[stage - 1].level : 0, all);
        }}
      />
    );
  }

  if (phase === 'between' && last) {
    return (
      <>
        <div className="celebrate">
          <div className="big" aria-hidden>
            ✅
          </div>
          <h1>Level {current.level} passed!</h1>
          <p className="muted">
            {last.right} of {last.total} right. Next up: Level {stages[stage + 1].level} — {stages[stage + 1].title}. It gets harder from here.
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => finish(current.level, totals ?? last)}>
            Stop here
          </button>
          <button
            className="btn primary grow"
            onClick={() => {
              setStage(stage + 1);
              setPhase('test');
            }}
          >
            Continue to Level {stages[stage + 1].level}
          </button>
        </div>
      </>
    );
  }

  if (phase === 'done' && totals) {
    const lvl = course.levels.find((l) => l.id === passedLevel);
    const nextLesson = idx.lessons.find((l) => (idx.unitByLesson.get(l.id)?.level ?? 0) > passedLevel && !store.getState().lessons[l.id]) ?? idx.lessons[0];
    return (
      <Report r={totals} title={passedLevel ? `Your level: ${passedLevel} — ${lvl?.title}` : 'Start from the beginning'}>
        <div className="card" style={{ marginTop: 12 }}>
          <strong>Where you are</strong>
          <p className="small" style={{ margin: '4px 0 10px' }}>
            {passedLevel
              ? `You already know the material in Level 1${passedLevel > 1 ? `–${passedLevel}` : ''}. The best place to continue is "${nextLesson.title}".`
              : 'The first lessons will teach you the basic words step by step — that\'s the perfect place to start.'}
          </p>
          {passedLevel > 0 && (
            <button
              className="btn primary block"
              onClick={() => {
                store.update((s) => testOut(s, idx, course, passedLevel, dateKey()));
                navigate(`/lesson/${nextLesson.id}`);
              }}
            >
              Skip Level{passedLevel > 1 ? 's' : ''} 1{passedLevel > 1 ? `–${passedLevel}` : ''} and start "{nextLesson.title}"
            </button>
          )}
          <a className={`btn block ${passedLevel ? '' : 'primary'}`} style={{ marginTop: 8 }} href={href(`/lesson/${passedLevel ? idx.lessons[0].id : nextLesson.id}`)}>
            {passedLevel ? 'Start from the beginning anyway' : `Start "${nextLesson.title}"`}
          </a>
        </div>
      </Report>
    );
  }

  return (
    <>
      <PageHead title="Placement test" backTo="/learn" />
      <div className="card hero">
        <h2 style={{ marginTop: 0 }}>Find your level</h2>
        <p style={{ margin: 0 }}>
          {PER_STAGE} questions per level, starting easy. Each level you pass unlocks a harder one; the test stops when it gets too hard. Takes about 3–6 minutes.
        </p>
      </div>
      <h2>The levels</h2>
      <div className="card">
        {stages.map((s) => (
          <div key={s.level} className="row small" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
            <span>
              Level {s.level}: {s.title}
            </span>
          </div>
        ))}
      </div>
      <p className="small muted">No hints, no second chances, and no pressure: wrong answers just get added to your reviews.</p>
      <button className="btn primary block" onClick={() => setPhase('test')}>
        Start the placement test
      </button>
    </>
  );
}
