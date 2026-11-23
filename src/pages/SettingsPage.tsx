import { useEffect, useState, type ReactNode } from 'react';
import { ConfirmDialog, PageHead, Segmented } from '../components/common';
import { RecognitionConsent } from '../components/SpeakPanel';
import { useAudioState } from '../hooks';
import type { Settings } from '../lib/progress';
import { audio } from '../services/audio';
import { isIOS, isStandalone } from '../services/speech';
import { tutorConfigured } from '../services/tutor';
import { store, useSettings } from '../state/store';
import { ProfileQuestions } from './LearnPage';
import { SpeakingCapabilities } from './SpeakPage';

function set<K extends keyof Settings>(key: K, value: Settings[K]) {
  store.update((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));
}

function Toggle({ label, sub, checked, onChange, disabled }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = 'tg-' + label.replace(/\W+/g, '-').toLowerCase();
  return (
    <div className="toggle-row">
      <label htmlFor={id} className="grow">
        <strong>{label}</strong>
        {sub && <div className="small muted">{sub}</div>}
      </label>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      <div className="card">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const s = useSettings();
  const { voice, ttsSupported } = useAudioState();
  const [confirmReset, setConfirmReset] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [swActive, setSwActive] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => audio.urduVoices());
  const [name, setName] = useState(s.learnerName);

  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', up);
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((r) => setSwActive(!!r?.active)).catch(() => setSwActive(false));
    else setSwActive(false);
    const unsub = audio.subscribe(() => setVoices(audio.urduVoices()));
    // Jump to an anchor like #/settings#speaking
    const anchor = window.location.hash.split('#')[2];
    if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView(), 50);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', up);
      unsub();
    };
  }, []);

  const scriptCount = [s.showRoman, s.showUrdu].filter(Boolean).length;

  const exportData = () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bolo-urdu-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <PageHead title="Settings" backTo="/learn" />

      <Section id="display" title="Display">
        <Toggle label="English translations" checked={s.showEnglish} onChange={(v) => set('showEnglish', v)} />
        <Toggle
          label="Roman Urdu"
          sub="Urdu written in English letters — the easiest way to start speaking."
          checked={s.showRoman}
          disabled={s.showRoman && scriptCount === 1}
          onChange={(v) => set('showRoman', v)}
        />
        <Toggle label="Urdu script (اردو)" sub="Right-to-left Nastaliq script." checked={s.showUrdu} disabled={s.showUrdu && scriptCount === 1} onChange={(v) => set('showUrdu', v)} />
        <p className="small muted">At least one of Roman Urdu or Urdu script stays on. Some exercises show a form regardless, when they need it.</p>
      </Section>

      <Section id="learner" title="You">
        <label className="stack" style={{ display: 'block' }}>
          <strong>First name</strong>
          <div className="row">
            <input className="search" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Used in “Mera naam … hai”" autoComplete="given-name" />
            <button className="btn" onClick={() => set('learnerName', name.trim())}>
              Save
            </button>
          </div>
        </label>
        <div style={{ marginTop: 14 }}>
          <strong>Show verb endings for</strong>
          <p className="small muted" style={{ margin: '2px 0 6px' }}>
            Urdu verbs often change with the speaker's gender (main thak gaya / gayi hoon). We show your form first and accept both in answers.
          </p>
          <Segmented
            label="Verb endings"
            value={s.learnerGender}
            onChange={(v) => set('learnerGender', v)}
            options={[
              { value: 'masculine', label: 'Masculine (-a)' },
              { value: 'feminine', label: 'Feminine (-i)' },
            ]}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <strong>Daily practice goal</strong>
          <div style={{ marginTop: 6 }}>
            <Segmented label="Daily goal" value={s.dailyGoalMinutes} onChange={(v) => set('dailyGoalMinutes', v)} options={[5, 10, 15, 20].map((m) => ({ value: m as Settings['dailyGoalMinutes'], label: `${m} min` }))} />
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            Counts time while you're actively doing lessons and practice (idle time isn't counted).
          </p>
        </div>
      </Section>

      <Section id="style" title="How you learn">
        <div className="stack">
          <ProfileQuestions
            style={s.learnStyle}
            setStyle={(v) => set('learnStyle', v)}
            pace={s.pace}
            setPace={(v) => set('pace', v)}
            why={s.goal}
            setWhy={(v) => set('goal', v)}
          />
          <p className="small muted" style={{ margin: 0 }}>
            Changes apply from your next lesson. The app also gives you extra practice in whichever skill — listening, reading, writing or speaking — you find hardest.
          </p>
        </div>
      </Section>

      <Section id="audio" title="Audio">
        {!ttsSupported ? (
          <p>This browser can't play synthesized speech. Lessons still work with Roman Urdu and Urdu script.</p>
        ) : voices.length === 0 ? (
          <div className="stack small">
            <p style={{ margin: 0 }}>
              <strong>No Urdu voice was found on this device</strong>, so model audio isn't available. Everything else still works.
            </p>
            <p style={{ margin: 0 }}>To add one:</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Microsoft Edge (desktop): online Urdu voices are usually available — try opening the app in Edge.</li>
              <li>Windows: Settings → Time & language → Speech → Add voices → Urdu.</li>
              <li>Android: install or update "Speech Services by Google" and check its languages.</li>
              <li>iPhone / Mac: Urdu voices may not be offered; availability varies by OS version.</li>
            </ul>
            <p className="muted" style={{ margin: 0 }}>
              No recorded native-speaker audio is bundled yet. When recordings are added to the course files, they're used automatically and labelled "Recorded audio".
            </p>
          </div>
        ) : (
          <>
            <label className="stack" style={{ display: 'block' }}>
              <strong>Urdu voice</strong>
              <select className="search" value={voice?.voiceURI ?? ''} onChange={(e) => set('voiceURI', e.target.value)}>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}){v.localService ? '' : ' — online'}
                  </option>
                ))}
              </select>
            </label>
            <p className="small muted">This is a synthesized voice. It's useful for practice but won't always match native pronunciation.</p>
          </>
        )}
        <label className="stack" style={{ display: 'block', marginTop: 12 }}>
          <strong>Normal speaking speed: {Math.round(s.speechRate * 100)}%</strong>
          <input type="range" min={0.5} max={1.2} step={0.05} value={s.speechRate} onChange={(e) => set('speechRate', Number(e.target.value))} style={{ width: '100%' }} aria-label="Speaking speed" />
          <span className="small muted">The "Slow" button plays at about two-thirds of this.</span>
        </label>
        {voice && (
          <button className="btn small" onClick={() => void audio.play({ urdu: 'آداب، آپ کیسے ہیں؟' })}>
            Test voice
          </button>
        )}
        <Toggle label="Answer sounds" sub="Short tones for right and wrong answers." checked={s.soundEffects} onChange={(v) => set('soundEffects', v)} />
      </Section>

      <Section id="speaking" title="Speaking, microphone & privacy">
        <SpeakingCapabilities detailed />
        <div className="stack small" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}>
            <strong>What happens to your voice:</strong>
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Record & compare</strong> keeps your recording only in this tab's memory. It's never uploaded or saved, and is deleted when you discard it or leave
              the screen.
            </li>
            <li>
              <strong>Speech recognition</strong> is provided by your browser. In Chrome and Edge, audio is sent to the browser company's speech service; Safari uses
              Apple's service (on-device or online). Leni Urdu Class only receives the recognized text.
            </li>
            <li>Leni Urdu Class has no analytics and never stores audio.</li>
          </ul>
        </div>
        <Toggle
          label="Use speech recognition"
          sub={s.recognitionConsent === 'unset' ? "We'll ask the first time you speak." : undefined}
          checked={s.recognitionConsent === 'granted'}
          onChange={(v) => (v ? setShowConsent(true) : set('recognitionConsent', 'declined'))}
        />
        <div className="toggle-row">
          <div className="grow">
            <strong>Recognition language</strong>
            <div className="small muted">Urdu (Pakistan) is recommended. Try Urdu (India) if your browser doesn't recognize ur-PK.</div>
          </div>
          <select className="search" style={{ maxWidth: 170 }} value={s.recognitionLang} onChange={(e) => set('recognitionLang', e.target.value as Settings['recognitionLang'])}>
            <option value="ur-PK">Urdu (Pakistan)</option>
            <option value="ur-IN">Urdu (India)</option>
          </select>
        </div>
        <Toggle
          label="Keep recognized text"
          sub="Save the text speech recognition heard in your practice history (text only, on this device). Off by default."
          checked={s.keepTranscripts}
          onChange={(v) => set('keepTranscripts', v)}
        />
        <details className="disclosure">
          <summary>Microphone not working?</summary>
          <ul className="small" style={{ paddingLeft: 18 }}>
            <li>Desktop Chrome / Edge: click the icon at the left of the address bar → Microphone → Allow, then reload.</li>
            <li>iPhone Safari: Settings → Safari → Microphone → Ask or Allow. Speech recognition also needs Siri & Dictation enabled.</li>
            <li>
              iPhone Home Screen app: speech recognition is often unavailable in installed web apps
              {isIOS() && isStandalone() ? ' (you are using one now)' : ''}. Record & compare usually still works; or open the site in Safari.
            </li>
            <li>Android Chrome: Site settings → Microphone → Allow.</li>
            <li>Speech recognition and microphone access require https (or localhost).</li>
          </ul>
          <p className="small muted">If you decline the microphone, all non-speaking lessons and self-check speaking practice keep working.</p>
        </details>
      </Section>

      <Section id="accessibility" title="Accessibility">
        <strong>Text size</strong>
        <div style={{ margin: '6px 0 10px' }}>
          <Segmented
            label="Text size"
            value={s.textScale}
            onChange={(v) => set('textScale', v)}
            options={[
              { value: 1, label: 'Default' },
              { value: 1.15, label: 'Large' },
              { value: 1.3, label: 'Larger' },
            ]}
          />
        </div>
        <Toggle label="Reduce motion" sub="Turns off animations. Your system setting is respected automatically." checked={s.motion === 'reduce'} onChange={(v) => set('motion', v ? 'reduce' : 'system')} />
      </Section>

      <Section id="offline" title="Offline & install">
        <div className="small stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Connection</span>
            <span className={`chip ${online ? 'green' : 'amber'}`}>{online ? 'Online' : 'Offline'}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Offline lessons</span>
            <span className={`chip ${swActive ? 'green' : ''}`}>{swActive === null ? 'Checking…' : swActive ? 'Saved for offline use' : 'Not available (dev mode or unsupported)'}</span>
          </div>
          <p style={{ margin: 0 }}>
            <strong>Works offline:</strong> lessons, exercises, vocabulary, scripted conversations, progress, record & compare, and model audio if your Urdu voice is
            installed locally.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Needs a connection:</strong> lesson audio, speech recognition in most browsers, online voices (e.g. Edge "Online" voices), and the optional AI tutor.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Install on iPhone:</strong> open in Safari → Share → Add to Home Screen. <strong>Android / desktop:</strong> use the browser's Install option.
          </p>
          <p style={{ margin: 0 }}>Your progress is stored on this device only and doesn't sync between devices.</p>
        </div>
      </Section>

      <Section id="data" title="Your data">
        <div className="small stack">
          <p style={{ margin: 0 }}>
            Progress (lessons, XP, review schedule, speaking practice counts and settings) is saved in this browser's local storage. No account is needed and nothing is
            sent to a server.
          </p>
          <p style={{ margin: 0 }}>AI tutor: {tutorConfigured() ? 'configured — messages you send in the tutor go to its server.' : 'not configured.'}</p>
        </div>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn" onClick={exportData}>
            Download my progress (JSON)
          </button>
          <button className="btn danger" onClick={() => setConfirmReset(true)}>
            Reset all progress
          </button>
        </div>
      </Section>

      <p className="small muted center" style={{ marginTop: 24 }}>
        Leni Urdu Class · content written for learners; it has not been reviewed by a panel of native-speaker teachers.
      </p>

      {confirmReset && (
        <ConfirmDialog
          title="Reset all progress?"
          body="This permanently deletes your XP, completed lessons, review schedule, speaking history, achievements and settings on this device. It can't be undone."
          confirm="Yes, reset everything"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            store.reset();
            setConfirmReset(false);
            window.location.hash = '/learn';
          }}
        />
      )}
      {showConsent && (
        <RecognitionConsent
          onClose={() => setShowConsent(false)}
          onDecide={(granted) => {
            set('recognitionConsent', granted ? 'granted' : 'declined');
            setShowConsent(false);
          }}
        />
      )}
    </>
  );
}
