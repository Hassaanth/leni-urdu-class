// "Start here": a zero-knowledge introduction to how Urdu is written in this app and how it sounds.
import { PageHead } from '../components/common';
import { IconPlay } from '../components/Icons';
import { useAudioState, useStopAudioOnUnmount } from '../hooks';
import { href } from '../router';
import { audio } from '../services/audio';
import { useCourse } from '../state/course';

const SOUNDS: { spell: string; like: string; roman: string; urdu: string; en: string }[] = [
  { spell: 'aa', like: 'long "a" as in father', roman: 'aaj', urdu: 'آج', en: 'today' },
  { spell: 'a', like: 'short, like the "u" in cup', roman: 'kab', urdu: 'کب', en: 'when' },
  { spell: 'ee', like: 'as in see', roman: 'teen', urdu: 'تین', en: 'three' },
  { spell: 'oo', like: 'as in food', roman: 'door', urdu: 'دور', en: 'far' },
  { spell: 'ai / e', like: 'like the "e" in bed, held a bit', roman: 'hai', urdu: 'ہے', en: 'is' },
  { spell: 'n at the end', like: 'often just air through the nose', roman: 'nahi', urdu: 'نہیں', en: 'no / not' },
  { spell: 'th', like: 't + a puff of air — never "th" as in think', roman: 'theek', urdu: 'ٹھیک', en: 'fine' },
  { spell: 'ph', like: 'p + a puff of air (not f)', roman: 'phir', urdu: 'پھر', en: 'then / again' },
  { spell: 'kh (کھ)', like: 'k + a puff of air', roman: 'khaana', urdu: 'کھانا', en: 'food' },
  { spell: 'kh (خ)', like: 'a scrape in the throat, like Scottish "loch"', roman: 'khush', urdu: 'خوش', en: 'happy' },
  { spell: 'gh (گھ)', like: 'g + breath', roman: 'ghar', urdu: 'گھر', en: 'home' },
  { spell: 'q', like: 'a k made deep in the throat', roman: 'qeemat', urdu: 'قیمت', en: 'price' },
  { spell: 'r', like: 'a quick tap of the tongue', roman: 'raat', urdu: 'رات', en: 'night' },
];

const FIRST_FIVE: { roman: string; urdu: string; en: string }[] = [
  { roman: 'Assalamu alaikum', urdu: 'السلام علیکم', en: 'Hello (peace be upon you)' },
  { roman: 'Shukriya', urdu: 'شکریہ', en: 'Thank you' },
  { roman: 'Ji haan', urdu: 'جی ہاں', en: 'Yes (polite)' },
  { roman: 'Nahi', urdu: 'نہیں', en: 'No' },
  { roman: 'Aahista boliye', urdu: 'آہستہ بولیے۔', en: 'Please speak slowly' },
];

function SayButton({ urdu, label }: { urdu: string; label: string }) {
  return (
    <button className="icon-btn play-dot" aria-label={`Play ${label}`} onClick={() => void audio.play({ urdu })}>
      <IconPlay />
    </button>
  );
}

export function StartPage() {
  const { course } = useCourse();
  useAudioState();
  useStopAudioOnUnmount();
  return (
    <>
      <PageHead title="Start here" backTo="/learn" />
      <section className="card hero">
        <h2 style={{ marginTop: 0 }}>Never spoken Urdu? Perfect.</h2>
        <p style={{ margin: 0 }}>
          You'll start speaking today. Every phrase comes three ways — and you can tap 🔊 to hear a Pakistani Urdu voice say it, slowly if you like.
        </p>
      </section>

      <h2>Meet the family</h2>
      <p className="small muted" style={{ marginTop: -4 }}>
        {course.story?.text}
      </p>
      <div className="grid-2">
        {course.characters
          .filter((c) => !c.id.startsWith('town'))
          .map((c) => (
            <div key={c.id} className="card" style={{ margin: 0 }}>
              <div style={{ fontSize: '2rem' }} aria-hidden>
                {c.avatar}
              </div>
              <strong>{c.name}</strong>
              <div className="small muted">{c.role}</div>
              <div className="small">{c.bio}</div>
            </div>
          ))}
      </div>

      <h2>1 · How phrases are shown</h2>
      <div className="card">
        <div className="roman" style={{ fontSize: '1.3rem' }} lang="ur-Latn">
          Aap kaise hain?
        </div>
        <div className="small muted">Roman Urdu — Urdu written with English letters. Read this out loud.</div>
        <div className="urdu" lang="ur" dir="rtl" style={{ fontSize: '1.4rem', marginTop: 6 }}>
          آپ کیسے ہیں؟
        </div>
        <div className="small muted">Urdu script — read right to left. Optional at first; it'll grow familiar.</div>
        <div style={{ marginTop: 6 }}>How are you?</div>
        <div className="small muted">English meaning.</div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => void audio.play({ urdu: 'آپ کیسے ہیں؟' })}>
            <IconPlay /> Hear it
          </button>
          <button className="btn small" onClick={() => void audio.play({ urdu: 'آپ کیسے ہیں؟' }, { slow: true })}>
            Slowly
          </button>
        </div>
      </div>

      <h2>2 · Reading Roman Urdu</h2>
      <p className="small muted" style={{ marginTop: -4 }}>
        Most letters sound like English. These are the ones to watch. Tap each to hear it.
      </p>
      <div className="card" style={{ padding: '4px 16px' }}>
        {SOUNDS.map((s) => (
          <div key={s.spell} className="vocab-item">
            <SayButton urdu={s.urdu} label={s.roman} />
            <div className="grow">
              <div>
                <strong className="chip teal">{s.spell}</strong> <span className="small">{s.like}</span>
              </div>
              <div className="small">
                <strong lang="ur-Latn">{s.roman}</strong> <span className="urdu" lang="ur" dir="rtl" style={{ fontSize: '1rem' }}>{s.urdu}</span>{' '}
                <span className="muted">— {s.en}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2>3 · Three grammar facts that unlock everything</h2>
      <div className="card stack small">
        <p style={{ margin: 0 }}>
          <strong>The verb goes last.</strong> "Mera naam Ali hai" = my name Ali <em>is</em>.
        </p>
        <p style={{ margin: 0 }}>
          <strong>"Aap" is the polite "you".</strong> Use it with everyone until you're close friends — it's never rude.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Some words change for men and women.</strong> A man says "main thak gaya hoon" (I'm tired), a woman says "main thak gayi hoon". The app shows
          your version and teaches both.
        </p>
      </div>

      <h2>4 · Your first five phrases</h2>
      <div className="card" style={{ padding: '4px 16px' }}>
        {FIRST_FIVE.map((p) => (
          <div key={p.roman} className="vocab-item">
            <SayButton urdu={p.urdu} label={p.roman} />
            <div className="grow">
              <div className="roman" lang="ur-Latn">
                {p.roman}
              </div>
              <div className="small muted">{p.en}</div>
            </div>
            <span className="urdu" lang="ur" dir="rtl">
              {p.urdu}
            </span>
          </div>
        ))}
      </div>

      <h2>5 · How to learn with this app</h2>
      <ol className="card small" style={{ paddingLeft: 34 }}>
        <li>Do one lesson a day, in order. Each one takes 5–10 minutes.</li>
        <li>Always say phrases out loud — even when no one is checking.</li>
        <li>Tap any word in a sentence to hear it alone and see what it means.</li>
        <li>Come back to Practice for reviews: phrases return just before you'd forget them.</li>
        <li>When a lesson has a role-play, do it: that's where you practise real conversation.</li>
      </ol>

      <a className="btn primary block" style={{ marginTop: 16 }} href={href('/lesson/b1')}>
        Start lesson 1: I am…
      </a>
    </>
  );
}
