import { useEffect, useRef, useState } from 'react';
import { PageHead, PhraseText, Segmented } from '../components/common';
import { IconEye, IconPlay } from '../components/Icons';
import { SpeakPanel } from '../components/SpeakPanel';
import { useAudioState, useName, usePracticeTimer, useStopAudioOnUnmount } from '../hooks';
import { choiceForTarget, getNode, reply, startConversation, type ConvState } from '../lib/conversation';
import { dateKey } from '../lib/dates';
import { completeConversation } from '../lib/progress';
import { fillSlots } from '../lib/text';
import { audio } from '../services/audio';
import { href } from '../router';
import { useCourse } from '../state/course';
import { store } from '../state/store';
import type { ConversationChoice } from '../types';
import { WordBreakdown } from '../components/WordBreakdown';

type Mode = 'beginner' | 'intermediate' | 'challenge';

export function ConversationPlayer({ id }: { id: string }) {
  const { course } = useCourse();
  usePracticeTimer(true);
  useStopAudioOnUnmount();
  const name = useName();
  const { voice } = useAudioState();
  const sc = course.conversations.find((c) => c.id === id);
  const [mode, setMode] = useState<Mode>('beginner');
  const [st, setSt] = useState<ConvState | null>(() => (sc ? startConversation(sc) : null));
  const [feedback, setFeedback] = useState<{ choice: ConversationChoice; heard: boolean } | null>(null);
  const [showLineHelp, setShowLineHelp] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [xp, setXp] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const node = sc && st ? getNode(sc, st.nodeId) : null;

  useEffect(() => {
    if (node) void audio.play({ urdu: fillSlots(node.line.urdu, name), voice: sc?.partner.voice });
    setShowLineHelp(false);
    setShowOptions(false);
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sc && st?.ended && xp === null) {
      let earned = 0;
      store.update((s) => {
        const r = completeConversation(s, sc.id, st.best, dateKey());
        earned = r.xpEarned;
        return r.state;
      });
      setXp(earned);
    }
  }, [st?.ended]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sc || !st || !node) {
    return (
      <>
        <PageHead title="Conversation not found" backTo="/talk" />
      </>
    );
  }

  const choose = (choice: ConversationChoice, heard = false) => setFeedback({ choice, heard });
  const proceed = () => {
    if (!feedback) return;
    const r = reply(sc, st, feedback.choice);
    setSt(r.state);
    setFeedback(null);
  };
  const restart = () => {
    setSt(startConversation(sc));
    setFeedback(null);
    setXp(null);
  };

  const lineTextVisible = mode === 'beginner' || mode === 'intermediate' || showLineHelp || !voice;
  const enVisible = mode === 'beginner' || showLineHelp;
  const optionsVisible = mode !== 'challenge' || showOptions;
  const good = (node.choices ?? []).filter((c) => c.quality !== 'wrong');

  return (
    <>
      <PageHead title={`${sc.emoji} ${sc.title}`} backTo="/talk" />
      <div className="card soft">
        <p style={{ margin: 0 }}>{sc.context}</p>
        <p className="small" style={{ margin: '6px 0 0' }}>
          <strong>Goal:</strong> {sc.goal}
        </p>
        <p className="small muted" style={{ margin: '4px 0 8px' }}>
          Talking with {sc.partner.name} ({sc.partner.role})
        </p>
        <Segmented
          label="Difficulty"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Middle' },
            { value: 'challenge', label: 'Challenge' },
          ]}
        />
      </div>

      <div className="dialogue" style={{ marginTop: 16 }} aria-live="polite">
        {st.turns.map((t, k) => (
          <div key={k} style={{ display: 'contents' }}>
            <div className="bubble them">
              <div className="who">{sc.partner.name}</div>
              <PhraseText roman={fillSlots(t.node.line.roman, name)} urdu={fillSlots(t.node.line.urdu, name)} en={t.node.line.en} size="sm" />
            </div>
            {t.choice && (
              <div className="bubble me">
                <div className="who">You</div>
                <PhraseText roman={fillSlots(t.choice.roman, name)} urdu={fillSlots(t.choice.urdu, name)} en={fillSlots(t.choice.en, name)} size="sm" />
              </div>
            )}
          </div>
        ))}

        <div className="bubble them" style={{ maxWidth: '100%' }}>
          <div className="who">{sc.partner.name}</div>
          {lineTextVisible ? (
            <PhraseText roman={fillSlots(node.line.roman, name)} urdu={fillSlots(node.line.urdu, name)} en={enVisible ? node.line.en : undefined} />
          ) : (
            <p className="muted small">Listen carefully…</p>
          )}
          <div className="row wrap">
            <button className="btn small ghost" onClick={() => void audio.play({ urdu: fillSlots(node.line.urdu, name), voice: sc.partner.voice })}>
              <IconPlay /> Play
            </button>
            <button className="btn small ghost" onClick={() => void audio.play({ urdu: fillSlots(node.line.urdu, name), voice: sc.partner.voice }, { slow: true })}>
              Slow
            </button>
            {!showLineHelp && mode !== 'beginner' && (
              <button className="btn small ghost" onClick={() => setShowLineHelp(true)}>
                <IconEye /> {mode === 'challenge' ? 'Show text' : 'Show English'}
              </button>
            )}
          </div>
          {node.note && (mode === 'beginner' || showLineHelp) && <div className="note">{node.note}</div>}
          {(mode === 'beginner' || showLineHelp) && <WordBreakdown urdu={fillSlots(node.line.urdu, name)} />}
        </div>
      </div>

      {st.ended ? (
        <div className="celebrate" ref={endRef}>
          <div className="big" aria-hidden>
            🎉
          </div>
          <h2>Conversation complete</h2>
          <p>{node.end}</p>
          <div className="stat-row" style={{ textAlign: 'center' }}>
            <div className="stat">
              <b>{st.best}</b>
              <span>Natural replies</span>
            </div>
            <div className="stat">
              <b>{st.ok}</b>
              <span>OK replies</span>
            </div>
            <div className="stat">
              <b>+{xp ?? 0}</b>
              <span>XP</span>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <a className="btn" href={href('/talk')}>
              All conversations
            </a>
            <button className="btn primary" onClick={restart}>
              Try other replies
            </button>
          </div>
        </div>
      ) : feedback ? (
        <div className={`result-card ${feedback.choice.quality === 'best' ? 'match' : feedback.choice.quality === 'ok' ? 'partial' : ''}`} role="status" ref={endRef}>
          {feedback.heard && <p className="small">We recognized your reply.</p>}
          <div className="r-title">{feedback.choice.quality === 'best' ? '✅ Natural reply' : feedback.choice.quality === 'ok' ? '👍 That works' : "❌ That doesn't fit"}</div>
          <p className="small">{feedback.choice.feedback}</p>
          <div className="card" style={{ boxShadow: 'none' }}>
            <PhraseText roman={fillSlots(feedback.choice.roman, name)} urdu={fillSlots(feedback.choice.urdu, name)} en={fillSlots(feedback.choice.en, name)} show={{ en: true, roman: true, urdu: true }} />
            <button className="btn small ghost" onClick={() => void audio.play({ urdu: fillSlots(feedback.choice.urdu, name) })}>
              <IconPlay /> Hear it
            </button>
          </div>
          {node.newWords && node.newWords.length > 0 && feedback.choice.quality !== 'wrong' && (
            <div style={{ marginTop: 8 }}>
              <strong className="small">Useful words</strong>
              {node.newWords.map((w, k) => (
                <div key={k} className="small">
                  <span className="roman" lang="ur-Latn">
                    {w.roman}
                  </span>{' '}
                  <span className="urdu" lang="ur" dir="rtl" style={{ fontSize: '1rem' }}>
                    {w.urdu}
                  </span>{' '}
                  — {w.en}
                </div>
              ))}
            </div>
          )}
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={feedback.choice.quality === 'wrong' ? () => setFeedback(null) : proceed}>
            {feedback.choice.quality === 'wrong' ? 'Try another reply' : 'Continue'}
          </button>
        </div>
      ) : (
        <div ref={endRef}>
          {mode === 'beginner' && node.newWords && node.newWords.length > 0 && (
            <p className="small muted">
              Hint:{' '}
              {node.newWords.map((w) => (
                <span key={w.roman}>
                  <strong lang="ur-Latn">{w.roman}</strong> = {w.en}.{' '}
                </span>
              ))}
            </p>
          )}
          {optionsVisible ? (
            <div className="options" role="group" aria-label="Your reply">
              {(node.choices ?? []).map((c, k) => (
                <button key={k} className="option" onClick={() => choose(c)}>
                  <span className="roman" lang="ur-Latn">
                    {fillSlots(c.roman, name)}
                  </span>
                  {mode === 'beginner' && <span className="en small">{fillSlots(c.en, name)}</span>}
                </button>
              ))}
            </div>
          ) : (
            <button className="btn block" onClick={() => setShowOptions(true)}>
              Show reply options
            </button>
          )}
          <SpeakPanel
            phraseKey={`${sc.id}:${node.id}`}
            label={node.line.roman}
            targets={good.map((c) => ({ roman: c.roman, urdu: c.urdu }))}
            model={null}
            name={name}
            hideExpected
            prompt={mode === 'challenge' ? 'Say your reply out loud.' : 'Or say your reply out loud:'}
            onAttempt={(r) => {
              if (r.outcome === 'match' && r.assessment) {
                const ch = choiceForTarget(node, r.assessment.target.roman);
                if (ch) choose(ch, true);
              } else if (r.outcome !== 'error') setShowOptions(true);
            }}
          />
        </div>
      )}
    </>
  );
}
