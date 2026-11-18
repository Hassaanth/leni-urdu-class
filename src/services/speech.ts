// Browser speech recognition (Web Speech API), isolated from lesson logic.
// It is an optional aid: every exercise also works without it.

export type RecErrorKind =
  | 'not-allowed' // permission denied by user or policy
  | 'service-not-allowed' // browser/OS blocked the recognition service (common in iOS home-screen apps)
  | 'no-speech'
  | 'audio-capture' // no microphone
  | 'network' // recognition service unreachable
  | 'aborted'
  | 'language-not-supported'
  | 'unsupported'
  | 'unknown';

export interface RecognitionCaps {
  supported: boolean;
  /** Plain-English reason when unsupported. */
  reason?: string;
  isIOS: boolean;
  standalone: boolean;
  secureContext: boolean;
}

interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [i: number]: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SRErrorEvent {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onspeechend?: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRConstructor = new () => SpeechRecognitionLike;

function getSR(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function recognitionCapabilities(): RecognitionCaps {
  const ios = isIOS();
  const standalone = isStandalone();
  const secureContext = typeof window !== 'undefined' && window.isSecureContext;
  if (!secureContext) {
    return { supported: false, reason: 'Speech recognition needs a secure (https) connection.', isIOS: ios, standalone, secureContext };
  }
  if (!getSR()) {
    return {
      supported: false,
      reason: "This browser doesn't offer speech recognition. You can still record yourself and compare with the model.",
      isIOS: ios,
      standalone,
      secureContext,
    };
  }
  return { supported: true, isIOS: ios, standalone, secureContext };
}

// Remember a denial for this session so we never re-trigger permission prompts in a loop.
let deniedThisSession = false;
export function micDeniedThisSession() {
  return deniedThisSession;
}
export function markMicDenied() {
  deniedThisSession = true;
}
// Recognition can be blocked (e.g. iPhone Home Screen apps) while the microphone itself still works.
let recognitionBlocked = false;
export function recognitionBlockedThisSession() {
  return recognitionBlocked;
}

export async function micPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const p = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    return (p?.state as 'granted' | 'denied' | 'prompt') ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface RecognitionHandlers {
  lang: string;
  onStart?: () => void;
  onInterim?: (text: string) => void;
  /** Called once with all final alternatives (possibly empty). */
  onResult: (alternatives: string[]) => void;
  onError: (kind: RecErrorKind, detail?: string) => void;
  onEnd?: () => void;
  /** Safety stop. */
  maxMs?: number;
}

export interface RecognitionSession {
  stop(): void;
  abort(): void;
}

const ERROR_MAP: Record<string, RecErrorKind> = {
  'not-allowed': 'not-allowed',
  'service-not-allowed': 'service-not-allowed',
  'no-speech': 'no-speech',
  'audio-capture': 'audio-capture',
  network: 'network',
  aborted: 'aborted',
  'language-not-supported': 'language-not-supported',
};

export function startRecognition(h: RecognitionHandlers): RecognitionSession {
  const SR = getSR();
  const noop = { stop() {}, abort() {} };
  if (!SR) {
    h.onError('unsupported');
    return noop;
  }
  let rec: SpeechRecognitionLike;
  try {
    rec = new SR();
  } catch (e) {
    h.onError('unknown', String(e));
    return noop;
  }
  rec.lang = h.lang;
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  rec.continuous = false;

  const finals: string[] = [];
  let errored = false;
  let delivered = false;
  const timer = setTimeout(() => {
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  }, h.maxMs ?? 12000);

  rec.onstart = () => h.onStart?.();
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        for (let a = 0; a < r.length; a++) if (r[a]?.transcript) finals.push(r[a].transcript);
      } else if (r[0]) interim += r[0].transcript;
    }
    if (interim) h.onInterim?.(interim);
  };
  rec.onerror = (e) => {
    errored = true;
    const kind = ERROR_MAP[e.error] ?? 'unknown';
    if (kind === 'not-allowed' || kind === 'service-not-allowed') recognitionBlocked = true;
    if (kind === 'no-speech') {
      // Not a technical failure — just nothing heard.
      delivered = true;
      h.onResult([]);
      return;
    }
    h.onError(kind, e.message);
  };
  rec.onend = () => {
    clearTimeout(timer);
    if (!errored && !delivered) {
      delivered = true;
      h.onResult([...new Set(finals)]);
    }
    h.onEnd?.();
  };
  try {
    rec.start();
  } catch (e) {
    clearTimeout(timer);
    h.onError('unknown', String(e));
    return noop;
  }
  return {
    stop() {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
    abort() {
      errored = true;
      clearTimeout(timer);
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

export function errorMessage(kind: RecErrorKind, caps: RecognitionCaps): { title: string; help: string } {
  switch (kind) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        title: 'Microphone or speech recognition is blocked.',
        help:
          caps.isIOS && caps.standalone
            ? 'Speech recognition is often unavailable in Home Screen apps on iPhone. Open Leni Urdu Class in Safari to use it, or use "Record & compare" below.'
            : caps.isIOS
              ? 'On iPhone: Settings → Safari → Microphone → Allow, and check Settings → Screen Time isn’t blocking Siri & Dictation. You can keep practising with "Record & compare".'
              : 'Allow microphone access using the icon in your browser’s address bar, then try again. You can keep practising without it.',
      };
    case 'audio-capture':
      return { title: 'No microphone found.', help: 'Connect or enable a microphone. Meanwhile, practise aloud and self-check against the model.' };
    case 'network':
      return {
        title: "Speech recognition couldn't reach its service.",
        help: 'This browser sends speech to an online service for recognition. Check your connection — or keep practising and self-check.',
      };
    case 'language-not-supported':
      return { title: "This browser can't recognize Urdu.", help: 'Try Chrome or Edge on desktop or Android, or Safari on iPhone. You can still practise aloud and self-check.' };
    case 'unsupported':
      return { title: 'Speech recognition isn’t available here.', help: caps.reason ?? 'You can still record yourself and compare with the model.' };
    case 'aborted':
      return { title: 'Listening stopped.', help: 'Tap the microphone to try again.' };
    default:
      return { title: 'Something went wrong with speech recognition.', help: 'This is a technical problem, not a mistake in your Urdu. Try again or self-check.' };
  }
}
