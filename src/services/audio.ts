// Audio playback: bundled neural Pakistani Urdu voice files (see scripts/gen_audio.py) when a
// line has one, otherwise the device's Urdu text-to-speech voice if one exists. Never throws.
import { normalizeUrdu } from '../lib/text';

export type AudioSource = 'recording' | 'synth' | 'none';
export type PlayResult = 'played' | 'unavailable' | 'error' | 'interrupted';

export interface Playable {
  urdu: string;
  roman?: string;
  /** Recorded audio file relative to ./content/audio/ */
  audio?: string;
  /** Prefer the male voice (male conversation characters). */
  voice?: 'm' | 'f';
}

type Listener = () => void;

class AudioService {
  private current: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private voicesLoaded = false;
  speaking = false;
  preferredVoiceURI: string | null = null;
  rate = 0.85;
  private files = { f: new Map<string, string>(), m: new Map<string, string>(), w: new Map<string, string>() };

  constructor() {
    if (typeof fetch !== 'undefined' && typeof window !== 'undefined') {
      fetch('./content/audio/index.json')
        .then((r) => (r.ok ? r.json() : {}))
        .then((idx: Partial<Record<'f' | 'm' | 'w', Record<string, string>>>) => {
          for (const sec of ['f', 'm', 'w'] as const)
            for (const [text, file] of Object.entries(idx[sec] ?? {})) this.files[sec].set(normalizeUrdu(text), file);
          this.emit();
        })
        .catch(() => undefined);
    }
    if (this.ttsSupported) {
      const synth = window.speechSynthesis;
      const onVoices = () => {
        this.voicesLoaded = true;
        this.emit();
      };
      synth.addEventListener?.('voiceschanged', onVoices);
      // Some browsers populate voices synchronously.
      if (synth.getVoices().length) this.voicesLoaded = true;
    }
  }

  get ttsSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  get ready() {
    return this.voicesLoaded;
  }

  urduVoices(): SpeechSynthesisVoice[] {
    if (!this.ttsSupported) return [];
    return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('ur'));
  }

  voice(): SpeechSynthesisVoice | null {
    const voices = this.urduVoices();
    if (!voices.length) return null;
    return voices.find((v) => v.voiceURI === this.preferredVoiceURI) ?? voices.find((v) => /pk/i.test(v.lang)) ?? voices[0];
  }

  /** Bundled audio file for a line. Latin words (a learner's name in a {name} slot) match the slot. */
  fileFor(item: Playable): string | undefined {
    if (item.audio) return item.audio;
    const key = normalizeUrdu(item.urdu);
    const slotKey = key.replace(/[A-Za-z][A-Za-z' -]*[A-Za-z]|[A-Za-z]/g, '{name}');
    const order = item.voice === 'm' ? (['m', 'f', 'w'] as const) : (['f', 'w', 'm'] as const);
    for (const sec of order) {
      const f = this.files[sec].get(key) ?? this.files[sec].get(slotKey);
      if (f) return f;
    }
    return undefined;
  }

  sourceFor(item: Playable): AudioSource {
    if (this.fileFor(item)) return 'recording';
    return this.voice() ? 'synth' : 'none';
  }

  stop() {
    if (this.current) {
      this.current.pause();
      this.current = null;
    }
    if (this.ttsSupported) window.speechSynthesis.cancel();
    if (this.speaking) {
      this.speaking = false;
      this.emit();
    }
  }

  async play(item: Playable, opts: { slow?: boolean } = {}): Promise<PlayResult> {
    this.stop();
    const file = this.fileFor(item);
    if (file) {
      const res = await this.playFile(`./content/audio/${file}`, opts.slow ? 0.75 : 1);
      // A bundled file exists: report its result rather than falling back to a device voice.
      if (res !== 'error' || !this.voice()) return res;
    }
    return this.speak(item.urdu, opts.slow ? Math.max(0.4, this.rate * 0.65) : this.rate);
  }

  private playFile(url: string, rate: number): Promise<PlayResult> {
    return new Promise((resolve) => {
      try {
        const el = new Audio(url);
        el.playbackRate = rate;
        this.current = el;
        this.speaking = true;
        this.emit();
        const done = (r: PlayResult) => {
          if (this.current === el) this.current = null;
          this.speaking = false;
          this.emit();
          resolve(r);
        };
        el.onended = () => done('played');
        el.onerror = () => done('error');
        el.onpause = () => {
          if (!el.ended) done('interrupted');
        };
        el.play().catch(() => done('error'));
      } catch {
        resolve('error');
      }
    });
  }

  private speak(text: string, rate: number): Promise<PlayResult> {
    const voice = this.voice();
    if (!this.ttsSupported || !voice) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = rate;
        let settled = false;
        const finish = (r: PlayResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(guard);
          this.speaking = false;
          this.emit();
          resolve(r);
        };
        // Some engines never fire "end"; don't leave the UI stuck.
        const guard = setTimeout(() => finish('played'), Math.max(4000, text.length * 220));
        u.onend = () => finish('played');
        u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? 'interrupted' : 'error');
        this.speaking = true;
        this.emit();
        window.speechSynthesis.speak(u);
      } catch {
        resolve('error');
      }
    });
  }
}

export const audio = new AudioService();
