// Runs any list of exercises: shows one at a time, validates answers, re-queues mistakes,
// records progress, and reports a summary at the end. Used by lessons and practice modes.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useName, usePracticeTimer, useStopAudioOnUnmount } from '../hooks';
import { ENCOURAGE, praise, TEACHER, teacherLine } from '../lib/teacher';
import { useCharacter } from '../state/course';
import { dateKey } from '../lib/dates';
import { isGraded, skillOf, SPEAKING, type Exercise } from '../lib/exercises';
import { introducePhrases, recordAnswer } from '../lib/progress';
import { audio } from '../services/audio';
import { store, useSettings } from '../state/store';
import { ConfirmDialog, ProgressBar } from './common';
import { ExerciseView, type ExApi, type Feedback } from './exercises';
import { IconCheck, IconX } from './Icons';
import type { AttemptResult } from './SpeakPanel';

export interface SessionSummary {
  graded: number;
  firstTryCorrect: number;
  accuracy: number;
  speakingAttempts: number;
  missedPhraseIds: string[];
  practicedPhraseIds: string[];
}

interface Props {
  title: string;
  exercises: Exercise[];
  /** Review sessions grade with review XP and don't re-queue flashcards. */
  review?: boolean;
  /** Character teaching this session (their voice and face). */
  host?: string;
  onFinish: (s: SessionSummary) => void;
  onExit: () => void;
}

type QueueItem = { ex: Exercise; key: string; retry: boolean };

function tone(ok: boolean) {
  // Tiny confirmation sound via WebAudio; silently skipped if unavailable.
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 660 : 220;
    o.type = 'sine';
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.25 : 0.3));
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.32);
    o.onended = () => ctx.close();
  } catch {
    /* ignore */
  }
}

export function SessionRunner({ title, exercises, review, host, onFinish, onExit }: Props) {
  const hostChar = useCharacter(host);
  const [combo, setCombo] = useState(0);
  const [xpPop, setXpPop] = useState(0);
  usePracticeTimer(true);
  useStopAudioOnUnmount();
  const settings = useSettings();
  const name = useName();
  const [queue, setQueue] = useState<QueueItem[]>(() => exercises.map((ex, i) => ({ ex, key: `${ex.id}#${i}`, retry: false })));
  const [pos, setPos] = useState(0);
  const [result, setResult] = useState<null | { correct: boolean; fb: Feedback }>(null);
  const [check, setCheckFn] = useState<null | (() => void)>(null);
  const [attempted, setAttempted] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const stats = useRef({ graded: 0, firstTry: 0, speaking: 0, missed: new Set<string>(), practiced: new Set<string>() });
  const bodyRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);

  const item = queue[pos];
  const ex = item?.ex;
  const speaking = ex ? SPEAKING.includes(ex.kind) : false;

  // Introduce phrases into the review system when they're first presented.
  useEffect(() => {
    if (ex?.kind === 'intro') store.update((s) => introducePhrases(s, [ex.phrase.id], dateKey()));
    bodyRef.current?.scrollTo({ top: 0 });
    bodyRef.current?.focus({ preventScroll: true });
  }, [ex]);

  const answer = useCallback(
    (correct: boolean, fb: Feedback = {}, opts: { requeue?: boolean } = {}) => {
      if (!item || result) return;
      const phraseIds = 'phraseIds' in item.ex ? item.ex.phraseIds : [];
      const firstTry = !item.retry;
      if (firstTry) {
        stats.current.graded++;
        if (correct) stats.current.firstTry++;
      }
      if (!correct) phraseIds.forEach((id) => stats.current.missed.add(id));
      phraseIds.forEach((id) => stats.current.practiced.add(id));
      store.update((s) => recordAnswer(s, { phraseIds, correct, firstTry, review, skill: skillOf(item.ex) }, dateKey()));
      const requeue = opts.requeue ?? true;
      if (!correct && requeue && isGraded(item.ex) && !item.retry) {
        setQueue((q) => [...q, { ex: item.ex, key: `${item.key}-retry`, retry: true }]);
      }
      if (settings.soundEffects) tone(correct);
      if (isGraded(item.ex) || item.ex.kind === 'flashcard') {
        setCombo((c) => (correct ? c + 1 : 0));
        if (correct) setXpPop((n) => n + 1);
        // The lesson's character reacts out loud, in Urdu.
        const line = correct ? praise(pos) : ENCOURAGE;
        setTimeout(() => void audio.play({ urdu: line.urdu, voice: host }), settings.soundEffects ? 320 : 0);
      }
      setResult({ correct, fb });
      setCheckFn(null);
      requestAnimationFrame(() => footRef.current?.focus());
    },
    [item, result, review, settings.soundEffects],
  );

  const api: ExApi = useMemo(
    () => ({
      locked: !!result,
      answer,
      setCheck: (fn) => setCheckFn(() => fn),
      host,
      noteAttempt: (r: AttemptResult) => {
        if (r.outcome !== 'error') {
          setAttempted(true);
          stats.current.speaking++;
        }
      },
    }),
    [answer, result, host],
  );

  const next = () => {
    audio.stop();
    setResult(null);
    setCheckFn(null);
    setAttempted(false);
    if (pos + 1 >= queue.length) {
      const s = stats.current;
      onFinish({
        graded: s.graded,
        firstTryCorrect: s.firstTry,
        accuracy: s.graded ? s.firstTry / s.graded : 1,
        speakingAttempts: s.speaking,
        missedPhraseIds: [...s.missed],
        practicedPhraseIds: [...s.practiced],
      });
    } else setPos(pos + 1);
  };

  if (!ex) return null;
  const graded = isGraded(ex) || ex.kind === 'flashcard';
  const done = pos + (result ? 1 : 0);

  let footer: ReactNode;
  if (result) {
    footer = (
      <>
        {result.correct || isGraded(ex) ? (
          <div className="react">
            <span className="speaker-avatar" aria-hidden>
              {hostChar.avatar}
            </span>
            <span className="small">
              <strong>{hostChar.name}:</strong> "{result.correct ? praise(pos).roman : ENCOURAGE.roman}" <span className="muted">— {result.correct ? praise(pos).en : ENCOURAGE.en}</span>
            </span>
          </div>
        ) : null}
        <div className="feedback-title" role="status">
          {result.correct ? <IconCheck width={24} height={24} /> : <IconX width={24} height={24} />}
          {result.correct ? (item.retry ? 'Got it this time!' : `Correct! ${praise(pos).roman}`) : 'Not quite — that\x27s how we learn'}
        </div>
        {!result.correct && result.fb.correctAnswer && (
          <div>
            <span className="small muted">Answer: </span>
            <strong>{result.fb.correctAnswer}</strong>
          </div>
        )}
        {result.fb.hint && <div className="small">{result.fb.hint}</div>}
        {result.fb.explain && <div className="small">{result.fb.explain}</div>}
        {!result.correct && isGraded(ex) && !item.retry && <div className="small muted">This one will come back at the end.</div>}
        <button className={`btn block ${result.correct ? 'primary' : 'danger'}`} onClick={next} autoFocus>
          Continue
        </button>
      </>
    );
  } else if (graded && ex.kind !== 'flashcard' && ex.kind !== 'match' && ex.kind !== 'say') {
    footer = (
      <button className="btn primary block" disabled={!check} onClick={() => check?.()}>
        Check
      </button>
    );
  } else if (ex.kind === 'match' || ex.kind === 'flashcard' || ex.kind === 'say') {
    footer = (
      <p className="small muted center" style={{ margin: 0 }}>
        {ex.kind === 'match' ? 'Match every pair to continue.' : ex.kind === 'say' ? 'Say it, then check your answer.' : 'Flip the card, then rate yourself.'}
      </p>
    );
  } else if (ex.kind === 'readAloud' && ex.passage.question) {
    footer = (
      <button className="btn block" onClick={next}>
        Skip for now
      </button>
    );
  } else {
    footer = (
      <button className={`btn block ${!speaking || attempted ? 'primary' : ''}`} onClick={next}>
        {speaking && !attempted ? 'Skip speaking for now' : 'Continue'}
      </button>
    );
  }

  return (
    <div className={`session ${settings.motion === 'reduce' ? 'reduce-motion' : ''}`} role="region" aria-label={title}>
      <div className="session-top">
        <button className="icon-btn" aria-label="Exit" onClick={() => setConfirmExit(true)}>
          <IconX />
        </button>
        <ProgressBar value={done / queue.length} label={`${title} progress`} />
        {combo >= 2 && (
          <span className="combo" aria-label={`${combo} in a row`}>
            🔥 {combo}
          </span>
        )}
        {xpPop > 0 && (
          <span className="xp-pop" key={xpPop} aria-hidden>
            +10 XP
          </span>
        )}
        <span className="small muted" aria-hidden>
          {done}/{queue.length}
        </span>
      </div>
      <div className="session-body" ref={bodyRef} tabIndex={-1} key={item.key}>
        {!result && (
          <div className="teacher">
            <span className="t-avatar" aria-hidden>
              {TEACHER.avatar}
            </span>
            <div className="t-bubble">
              <span className="sr-only">{TEACHER.name} says: </span>
              {teacherLine(ex, settings.learnStyle, name, ex.kind === 'intro' && !queue.slice(0, pos).some((q) => q.ex.kind === 'intro'))}
            </div>
          </div>
        )}
        <ExerciseView ex={ex} api={api} />
      </div>
      <div
        className={`session-foot ${result ? (result.correct ? 'correct' : 'wrong') : ''}`}
        ref={footRef}
        tabIndex={-1}
        aria-live="polite"
      >
        <div className="session-foot-inner">{footer}</div>
      </div>
      {confirmExit && (
        <ConfirmDialog
          title="Leave this session?"
          body="Answers so far are saved, but you'll need to restart the session to finish it."
          confirm="Leave"
          onConfirm={onExit}
          onCancel={() => setConfirmExit(false)}
        />
      )}
    </div>
  );
}
