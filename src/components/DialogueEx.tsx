// A lesson's conversation. "listen": hear it all first (text optional). "speak": the learner plays their part.
import { useEffect, useRef, useState } from 'react';
import { useName } from '../hooks';
import type { Exercise } from '../lib/exercises';
import { fillSlots } from '../lib/text';
import { audio } from '../services/audio';
import { useSettings } from '../state/store';
import type { DialogueTurn } from '../types';
import { PhraseText } from './common';
import type { ExApi } from './exercises';
import { IconEye, IconPlay } from './Icons';
import { SpeakPanel } from './SpeakPanel';
import { WordBreakdown } from './WordBreakdown';

type Of = Extract<Exercise, { kind: 'dialogue' }>;

export function DialogueEx({ ex, api }: { ex: Of; api: ExApi }) {
  const settings = useSettings();
  const name = useName();
  const d = ex.dialogue;
  const fem = settings.learnerGender === 'feminine';
  const form = (l: DialogueTurn) => {
    const base = l.who === 'you' && fem && l.f ? l.f : l;
    return { roman: fillSlots(base.roman, name), urdu: fillSlots(base.urdu, name), en: fillSlots(l.en, name) };
  };
  const voiceOf = (l: DialogueTurn) => (l.who === 'them' ? d.partner.voice : 'f');
  useEffect(() => api.setCheck(null), []); // eslint-disable-line

  return ex.mode === 'listen' ? <ListenAll ex={ex} form={form} voiceOf={voiceOf} /> : <SpeakPart ex={ex} api={api} form={form} voiceOf={voiceOf} name={name} />;
}

interface Helpers {
  form: (l: DialogueTurn) => { roman: string; urdu: string; en: string };
  voiceOf: (l: DialogueTurn) => 'm' | 'f' | undefined;
}

function ListenAll({ ex, form, voiceOf }: { ex: Of } & Helpers) {
  const settings = useSettings();
  const d = ex.dialogue;
  // Listeners hear it before seeing it; visual learners see it straight away.
  const [showText, setShowText] = useState(settings.learnStyle !== 'listen');
  const [showEn, setShowEn] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const stop = useRef(false);
  useEffect(() => () => void (stop.current = true), []);
  const playAll = async () => {
    stop.current = false;
    for (let i = 0; i < d.lines.length; i++) {
      if (stop.current) break;
      setPlaying(i);
      const r = await audio.play({ urdu: form(d.lines[i]).urdu, voice: voiceOf(d.lines[i]) });
      if (r === 'interrupted') break;
      await new Promise((res) => setTimeout(res, 350));
    }
    setPlaying(null);
  };
  return (
    <div>
      <div className="ex-kicker">Listen to a real conversation</div>
      <h2 className="ex-title">{d.title}</h2>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={playAll} disabled={playing !== null}>
          <IconPlay /> {playing === null ? 'Play the conversation' : 'Playing…'}
        </button>
        {!showText && (
          <button className="btn" onClick={() => setShowText(true)}>
            <IconEye /> Show the words
          </button>
        )}
        {showText && (
          <button className="btn small ghost" aria-pressed={showEn} onClick={() => setShowEn(!showEn)}>
            {showEn ? 'Hide' : 'Show'} English
          </button>
        )}
      </div>
      <div className="dialogue">
        {d.lines.map((l, i) => {
          const f = form(l);
          return (
            <button
              key={i}
              className={`bubble ${l.who === 'you' ? 'me' : 'them'} ${playing === i ? 'speaking' : ''}`}
              style={{ textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
              onClick={() => void audio.play({ urdu: f.urdu, voice: voiceOf(l) })}
              aria-label={`Play line ${i + 1}`}
            >
              <div className="who">{l.who === 'you' ? 'You' : d.partner.name} 🔊</div>
              {showText ? <PhraseText roman={f.roman} urdu={f.urdu} en={showEn ? f.en : undefined} show={{ en: showEn, roman: true }} /> : <span className="muted">· · ·</span>}
            </button>
          );
        })}
      </div>
      <p className="small muted">Tap any line to hear it again. You'll learn these phrases one by one next.</p>
    </div>
  );
}

function SpeakPart({ ex, api, form, voiceOf, name }: { ex: Of; api: ExApi; name: string } & Helpers) {
  const d = ex.dialogue;
  const [step, setStep] = useState(0);
  const [hint, setHint] = useState(false);
  const line = d.lines[step];
  const done = step >= d.lines.length;
  // Partner lines play automatically and move on.
  useEffect(() => {
    if (!line || line.who !== 'them') return;
    let cancelled = false;
    void audio.play({ urdu: form(line).urdu, voice: voiceOf(line) }).then(() => {
      if (!cancelled) setTimeout(() => setStep((s) => s + 1), 400);
    });
    return () => {
      cancelled = true;
    };
  }, [step]); // eslint-disable-line
  useEffect(() => setHint(false), [step]);

  return (
    <div>
      <div className="ex-kicker">Your turn to talk</div>
      <h2 className="ex-title">{d.title}</h2>
      <div className="dialogue">
        {d.lines.slice(0, Math.min(step + 1, d.lines.length)).map((l, i) => {
          const f = form(l);
          const current = i === step;
          if (l.who === 'you' && current) {
            return (
              <div key={i} className="bubble me" style={{ maxWidth: '100%' }}>
                <div className="who">You — say:</div>
                <div style={{ fontWeight: 800 }}>{f.en}</div>
                {hint ? (
                  <PhraseText roman={f.roman} urdu={f.urdu} show={{ roman: true }} size="sm" />
                ) : (
                  <button className="btn small ghost" onClick={() => setHint(true)}>
                    <IconEye /> Need a hint?
                  </button>
                )}
              </div>
            );
          }
          return (
            <div key={i} className={`bubble ${l.who === 'you' ? 'me' : 'them'}`}>
              <div className="who">{l.who === 'you' ? 'You' : d.partner.name}</div>
              <PhraseText roman={f.roman} urdu={f.urdu} en={f.en} size="sm" />
            </div>
          );
        })}
      </div>
      {!done && line.who === 'you' && (
        <>
          <SpeakPanel
            key={step}
            phraseKey={`${ex.id}#${step}`}
            label={form(line).roman}
            targets={[line, ...(line.f ? [line.f] : [])].map((t) => ({ roman: t.roman, urdu: t.urdu }))}
            model={{ urdu: form(line).urdu }}
            showModelButtons={hint}
            name={name}
            hideExpected={!hint}
            onAttempt={(r) => {
              api.noteAttempt(r);
            }}
          />
          <WordBreakdown urdu={form(line).urdu} label="Words in your line (tap to hear)" />
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => setStep(step + 1)}>
            Next line
          </button>
        </>
      )}
      {done && (
        <div className="result-card match" role="status">
          <div className="r-title">You just had a whole conversation in Urdu. Shabash! 🎉</div>
          <p className="small">That's exactly how real speaking practice works: listen, understand, reply.</p>
        </div>
      )}
    </div>
  );
}
