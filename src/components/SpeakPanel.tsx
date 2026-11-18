// The speaking-practice control used everywhere (lessons, Speak tab, games, conversations).
//
// Three tiers, chosen by what the browser actually supports:
//  1. Speech recognition (with the learner's informed consent) → recognized text compared to targets.
//  2. Record & compare (MediaRecorder) → learner hears their own attempt next to the model. Local only.
//  3. Self-check → learner says it aloud and rates themselves.
// Feedback never claims to measure pronunciation; recognition failures are never counted as mistakes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dateKey } from '../lib/dates';
import { recordSpeaking, startSpeakingSession, type SpeechOutcome } from '../lib/progress';
import { assessSpeech, fillSlots, speechFeedback, type SpeechAssessment } from '../lib/text';
import { audio, type Playable } from '../services/audio';
import { recorderSupported, startRecording, type ActiveRecording } from '../services/recorder';
import {
  errorMessage,
  micDeniedThisSession,
  recognitionBlockedThisSession,
  recognitionCapabilities,
  startRecognition,
  type RecErrorKind,
  type RecognitionSession,
} from '../services/speech';
import { store, useSettings } from '../state/store';
import type { FormPair } from '../types';
import { Modal, PlayButtons } from './common';
import { IconMic, IconPlay, IconRecord, IconStop, IconTrash } from './Icons';

export interface AttemptResult {
  outcome: SpeechOutcome;
  assessment?: SpeechAssessment;
}

interface Props {
  phraseKey: string;
  label: string;
  targets: FormPair[];
  model?: Playable | null;
  name: string;
  /** Hide the expected phrase until after an attempt (challenge / from-memory modes). */
  hideExpected?: boolean;
  onAttempt?: (r: AttemptResult) => void;
  prompt?: string;
  maxAttempts?: number;
  showModelButtons?: boolean;
}

type Phase = 'idle' | 'listening' | 'recording' | 'result' | 'recorded' | 'error' | 'self';

// One "speaking session" per screen visit with at least one attempt.
let sessionCounted = false;
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => (sessionCounted = false));

export function SpeakPanel({ phraseKey, label, targets, model, name, hideExpected, onAttempt, prompt, maxAttempts, showModelButtons = true }: Props) {
  const settings = useSettings();
  const caps = useMemo(() => recognitionCapabilities(), []);
  const canRecord = useMemo(() => recorderSupported(), []);
  const [phase, setPhase] = useState<Phase>('idle');
  const [interim, setInterim] = useState('');
  const [assessment, setAssessment] = useState<SpeechAssessment | null>(null);
  const [error, setError] = useState<RecErrorKind | 'rec-not-allowed' | 'rec-no-mic' | 'rec-unknown' | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  // iPhone Home Screen apps block speech recognition, so start with Record & compare there.
  const [preferRecorder, setPreferRecorder] = useState(() => caps.isIOS && caps.standalone);
  const [selfRated, setSelfRated] = useState<null | 'good' | 'retry'>(null);
  const recRef = useRef<RecognitionSession | null>(null);
  const recordingRef = useRef<ActiveRecording | null>(null);
  const micRef = useRef<HTMLButtonElement>(null);

  const recognitionUsable = caps.supported && settings.recognitionConsent !== 'declined' && !micDeniedThisSession() && !recognitionBlockedThisSession() && !preferRecorder;
  const mode: 'recognition' | 'recorder' | 'self' = recognitionUsable ? 'recognition' : canRecord && !micDeniedThisSession() ? 'recorder' : 'self';
  const outOfTries = maxAttempts !== undefined && attempts >= maxAttempts;

  // Reset when the phrase changes.
  useEffect(() => {
    setPhase('idle');
    setAssessment(null);
    setInterim('');
    setError(null);
    setAttempts(0);
    setSelfRated(null);
    setBlobUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return null;
    });
  }, [phraseKey]);

  // Clean up mic and memory on unmount.
  useEffect(
    () => () => {
      recRef.current?.abort();
      recordingRef.current?.cancel();
    },
    [],
  );
  useEffect(() => () => void (blobUrl && URL.revokeObjectURL(blobUrl)), [blobUrl]);

  const log = useCallback(
    (outcome: SpeechOutcome, usedRecognition: boolean, transcript?: string, ratingOnly = false) => {
      const today = dateKey();
      store.update((s) => {
        let next = s;
        if (!sessionCounted && outcome !== 'error') {
          sessionCounted = true;
          next = startSpeakingSession(next);
        }
        return recordSpeaking(next, { key: phraseKey, label, outcome, transcript, usedRecognition, ratingOnly }, today).state;
      });
    },
    [phraseKey, label],
  );

  const finishAttempt = (r: AttemptResult) => {
    if (r.outcome !== 'error') setAttempts((a) => a + 1);
    onAttempt?.(r);
  };

  // ---- Recognition ----
  const startListening = () => {
    if (settings.recognitionConsent === 'unset') {
      setShowConsent(true);
      return;
    }
    audio.stop();
    setError(null);
    setAssessment(null);
    setInterim('');
    setPhase('listening');
    recRef.current = startRecognition({
      lang: settings.recognitionLang,
      onInterim: setInterim,
      onResult: (alts) => {
        const a = assessSpeech(alts, targets);
        setAssessment(a);
        setPhase('result');
        const outcome: SpeechOutcome = a.status;
        log(outcome, true, a.transcript);
        finishAttempt({ outcome, assessment: a });
      },
      onError: (kind) => {
        if (kind === 'aborted') {
          setPhase('idle');
          return;
        }
        setError(kind);
        setPhase('error');
        log('error', true);
        onAttempt?.({ outcome: 'error' });
      },
    });
  };

  const stopListening = () => recRef.current?.stop();
  const cancelListening = () => {
    recRef.current?.abort();
    setPhase('idle');
    setInterim('');
  };

  // ---- Local recording ----
  const startRec = async () => {
    audio.stop();
    setError(null);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    try {
      const r = await startRecording(15000);
      recordingRef.current = r;
      setPhase('recording');
      const loop = () => {
        if (recordingRef.current !== r) return;
        micRef.current?.style.setProperty('--lvl', String(r.level()));
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      r.stop().then((blob) => {
        if (recordingRef.current !== r) return;
        recordingRef.current = null;
        if (!blob) {
          setPhase('idle');
          return;
        }
        setBlobUrl(URL.createObjectURL(blob));
        setPhase('recorded');
        log('practiced', false);
        finishAttempt({ outcome: 'practiced' });
      });
    } catch (e) {
      const kind = (e as { kind?: string }).kind;
      setError(kind === 'not-allowed' ? 'rec-not-allowed' : kind === 'no-mic' ? 'rec-no-mic' : 'rec-unknown');
      setPhase('error');
      log('error', false);
      onAttempt?.({ outcome: 'error' });
    }
  };
  const stopRec = () => recordingRef.current?.stop();
  const discardRec = () => {
    if (recordingRef.current) {
      const r = recordingRef.current;
      recordingRef.current = null;
      r.cancel();
    }
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setPhase('idle');
  };
  const playMine = () => {
    if (!blobUrl) return;
    audio.stop();
    const el = new Audio(blobUrl);
    el.play().catch(() => undefined);
  };

  // ---- Self check ----
  const selfRate = (good: boolean) => {
    setSelfRated(good ? 'good' : 'retry');
    // After a recorded or recognized attempt, the rating describes that attempt rather than adding one.
    log(good ? 'self-good' : 'self-retry', false, undefined, phase !== 'self');
    // A self-rating after an unassessed attempt doesn't add another attempt.
    if (phase === 'self') finishAttempt({ outcome: good ? 'self-good' : 'self-retry' });
    else onAttempt?.({ outcome: good ? 'self-good' : 'self-retry' });
  };

  const onMic = () => {
    if (outOfTries) return;
    if (phase === 'listening') return stopListening();
    if (phase === 'recording') return stopRec();
    setSelfRated(null);
    if (mode === 'recognition') startListening();
    else if (mode === 'recorder') void startRec();
    else {
      audio.stop();
      setPhase('self');
    }
  };

  const live = phase === 'listening' || phase === 'recording';
  const expected = targets[0];
  const fb = assessment ? speechFeedback(assessment) : null;
  const errInfo =
    error === 'rec-not-allowed'
      ? { title: 'Microphone access is blocked.', help: 'Allow the microphone in your browser settings to record yourself. You can still practise aloud and self-check.' }
      : error === 'rec-no-mic'
        ? { title: 'No microphone found.', help: 'Connect a microphone, or practise aloud and self-check.' }
        : error === 'rec-unknown'
          ? { title: "Recording couldn't start.", help: 'This is a technical problem, not a mistake in your Urdu.' }
          : error
            ? errorMessage(error, caps)
            : null;

  const micLabel =
    phase === 'listening'
      ? 'Listening… tap to stop'
      : phase === 'recording'
        ? 'Recording… tap to stop'
        : outOfTries
          ? 'No tries left'
          : mode === 'recognition'
            ? attempts
              ? 'Tap to try again'
              : 'Tap and speak'
            : mode === 'recorder'
              ? attempts
                ? 'Record again'
                : 'Record yourself'
              : 'Say it aloud';

  return (
    <section className="speak-panel" aria-label="Speaking practice">
      {prompt && <p style={{ fontWeight: 700 }}>{prompt}</p>}
      {showModelButtons && model && <PlayButtons item={model} />}

      <div className="mic-zone">
        <button
          ref={micRef}
          className={`mic-btn ${live ? 'live' : ''}`}
          onClick={onMic}
          disabled={outOfTries}
          aria-pressed={live}
          aria-label={micLabel}
        >
          {live ? <IconStop /> : mode === 'recorder' ? <IconRecord /> : <IconMic />}
        </button>
        <div className="mic-label" aria-hidden>
          {micLabel}
        </div>
        {live && (
          <div className="live-banner" role="status">
            <span className="rec-dot" /> {phase === 'listening' ? 'Microphone on — speak now' : 'Recording on this device'}
          </div>
        )}
        {phase === 'listening' && (
          <>
            <div className="interim" aria-live="polite" lang="ur">
              {interim}
            </div>
            <button className="btn small" onClick={cancelListening}>
              Cancel
            </button>
          </>
        )}
        {phase === 'recording' && (
          <button className="btn small" onClick={discardRec}>
            <IconTrash /> Discard
          </button>
        )}
        {maxAttempts !== undefined && (
          <div className="small muted">
            Try {Math.min(attempts + (live ? 1 : 0), maxAttempts)} of {maxAttempts}
          </div>
        )}
        {attempts === 0 && phase === 'idle' && (
          <p className="small muted center" style={{ maxWidth: 360 }}>
            {mode === 'recognition'
              ? "Uses your browser's speech recognition to check what it heard. It can't grade pronunciation."
              : mode === 'recorder'
                ? 'Records on this device only, so you can compare yourself with the model. Nothing is uploaded or saved.'
                : 'Say the phrase out loud, then check yourself against the example.'}
          </p>
        )}
        {caps.supported && caps.isIOS && caps.standalone && mode === 'recognition' && attempts === 0 && (
          <p className="small muted center">On iPhone Home Screen apps, speech recognition may not work. If it fails, use Record & compare.</p>
        )}
      </div>

      {phase === 'result' && assessment && fb && (
        <div className={`result-card ${assessment.status}`} role="status" aria-live="polite">
          <div className="r-title">{fb.title}</div>
          {assessment.transcript ? (
            <p className="small" style={{ margin: '6px 0' }}>
              We heard:{' '}
              <span lang={assessment.script === 'urdu' ? 'ur' : 'ur-Latn'} dir={assessment.script === 'urdu' ? 'rtl' : 'ltr'} className={assessment.script === 'urdu' ? 'urdu' : ''}>
                “{assessment.transcript}”
              </span>
            </p>
          ) : null}
          {assessment.marks.length > 0 && (
            <>
              <div className="small muted">Compared with:</div>
              <div className={`word-marks ${assessment.script === 'urdu' ? 'rtl urdu' : ''}`} lang={assessment.script === 'urdu' ? 'ur' : 'ur-Latn'}>
                {assessment.marks.map((m, i) => (
                  <span key={i} className={`wm ${m.text.startsWith('{') ? 'ok' : m.state}`}>
                    {fillSlots(m.text, name)}
                  </span>
                ))}
              </div>
              {assessment.script === 'urdu' && (
                <div className="small" lang="ur-Latn">
                  ({fillSlots(assessment.target.roman, name)})
                </div>
              )}
            </>
          )}
          <p className="small" style={{ margin: '6px 0 0' }}>
            {fb.tip}
          </p>
          {(assessment.status === 'different' || assessment.status === 'partial') && !selfRated && (
            <div className="row wrap" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={() => selfRate(true)}>
                I'm confident I said it
              </button>
              <button className="btn small ghost" onClick={() => selfRate(false)}>
                I'll practise more
              </button>
            </div>
          )}
          <p className="honesty">Speech-to-text result only, not a pronunciation score. Recognition can mishear correct Urdu.</p>
        </div>
      )}

      {phase === 'recorded' && blobUrl && (
        <div className="result-card" role="status">
          <div className="r-title">Good practice — now compare.</div>
          <p className="small">Play your attempt, then the model. Listen for the vowels and the rhythm.</p>
          <div className="row wrap">
            <button className="btn small" onClick={playMine}>
              <IconPlay /> My attempt
            </button>
            {model && audio.sourceFor(model) !== 'none' && (
              <button className="btn small" onClick={() => void audio.play(model)}>
                <IconPlay /> Model
              </button>
            )}
            <button className="btn small ghost" onClick={discardRec}>
              <IconTrash /> Discard
            </button>
          </div>
          {!selfRated && <SelfCheck onRate={selfRate} />}
          <p className="honesty">Your recording stays in this tab's memory and is deleted when you discard it or leave.</p>
        </div>
      )}

      {phase === 'self' && (
        <div className="result-card" role="status">
          <div className="r-title">Say it out loud now.</div>
          <p className="small">Then compare with the example below and rate yourself honestly.</p>
          {!selfRated && <SelfCheck onRate={selfRate} />}
        </div>
      )}

      {selfRated && (
        <p className="small" role="status" style={{ marginTop: 8 }}>
          {selfRated === 'good' ? '👍 Nice. Saved as practised.' : '🔁 Saved. This phrase will come up again in practice.'}
        </p>
      )}

      {phase === 'error' && errInfo && (
        <div className="result-card" role="alert">
          <div className="r-title">{errInfo.title}</div>
          <p className="small">{errInfo.help}</p>
          <div className="row wrap">
            {canRecord && !micDeniedThisSession() && error !== 'rec-not-allowed' && (
              <button className="btn small" onClick={() => setPreferRecorder(true)}>
                Use Record & compare
              </button>
            )}
            <button
              className="btn small"
              onClick={() => {
                setError(null);
                setPhase('self');
              }}
            >
              Practise without the mic
            </button>
          </div>
          <p className="honesty">This won't count against your progress.</p>
        </div>
      )}

      {(hideExpected ? attempts > 0 || phase === 'self' : true) && expected && (
        <details className="disclosure" open={!hideExpected}>
          <summary>{hideExpected ? 'Show example answer' : 'Example'}</summary>
          {targets.slice(0, hideExpected ? 3 : 1).map((t, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div className="roman" lang="ur-Latn">
                {fillSlots(t.roman, name)}
              </div>
              {settings.showUrdu && (
                <div className="urdu" lang="ur" dir="rtl">
                  {fillSlots(t.urdu, name)}
                </div>
              )}
            </div>
          ))}
        </details>
      )}

      <div className="row wrap" style={{ marginTop: 6 }}>
        {mode === 'recognition' && canRecord && (
          <button className="btn small ghost" onClick={() => setPreferRecorder(true)}>
            Record & compare instead
          </button>
        )}
        {preferRecorder && caps.supported && (
          <button className="btn small ghost" onClick={() => setPreferRecorder(false)}>
            Use speech recognition
          </button>
        )}
        {!preferRecorder && caps.supported && settings.recognitionConsent === 'declined' && (
          <button className="btn small ghost" onClick={() => setShowConsent(true)}>
            Turn on speech recognition
          </button>
        )}
      </div>

      {showConsent && (
        <RecognitionConsent
          onClose={() => setShowConsent(false)}
          onDecide={(granted) => {
            store.update((s) => ({ ...s, settings: { ...s.settings, recognitionConsent: granted ? 'granted' : 'declined' } }));
            setShowConsent(false);
            if (granted) setPreferRecorder(false);
          }}
        />
      )}
    </section>
  );
}

function SelfCheck({ onRate }: { onRate: (good: boolean) => void }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="small muted">How did it go?</div>
      <div className="row wrap" style={{ marginTop: 4 }}>
        <button className="btn small" onClick={() => onRate(true)}>
          😊 Sounded right
        </button>
        <button className="btn small" onClick={() => onRate(false)}>
          🔁 Need more practice
        </button>
      </div>
    </div>
  );
}

export function RecognitionConsent({ onDecide, onClose }: { onDecide: (granted: boolean) => void; onClose: () => void }) {
  return (
    <Modal title="Use speech recognition?" onClose={onClose}>
      <div className="stack small">
        <p>Speech recognition turns what you say into text, so we can check whether your phrase was recognized.</p>
        <p>
          <strong>It's provided by your browser, not by Leni Urdu Class.</strong> In Chrome and Edge, your voice is sent to the browser company's online speech service to be
          transcribed. Safari uses Apple's speech service, which may process audio on your device or on Apple's servers.
        </p>
        <p>Leni Urdu Class itself never uploads or saves your audio. It only receives the recognized text, and keeps it only if you switch on "Keep recognized text" in Settings.</p>
        <p>Prefer full privacy? Choose "Record & compare": your recording stays on this device and is deleted when you move on.</p>
        <p className="muted">Your browser will also ask for microphone permission the first time.</p>
      </div>
      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn primary block" onClick={() => onDecide(true)}>
          Allow speech recognition
        </button>
        <button className="btn block" onClick={() => onDecide(false)}>
          Use Record & compare only
        </button>
      </div>
    </Modal>
  );
}
