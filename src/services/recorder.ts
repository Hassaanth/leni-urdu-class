// Local "record & compare" using MediaRecorder. Audio stays in memory as a blob URL,
// is never uploaded or saved, and is discarded when the learner moves on.
import { markMicDenied } from './speech';

export function recorderSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined' &&
    window.isSecureContext
  );
}

function pickMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });
}

export type RecorderError = 'not-allowed' | 'no-mic' | 'unsupported' | 'unknown';

export interface ActiveRecording {
  /** Live input level 0–1, for the listening indicator. */
  level(): number;
  stop(): Promise<Blob | null>;
  cancel(): void;
}

export async function startRecording(maxMs = 15000): Promise<ActiveRecording> {
  if (!recorderSupported()) throw Object.assign(new Error('unsupported'), { kind: 'unsupported' as RecorderError });
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    const name = (e as DOMException)?.name;
    const kind: RecorderError = name === 'NotAllowedError' || name === 'SecurityError' ? 'not-allowed' : name === 'NotFoundError' ? 'no-mic' : 'unknown';
    if (kind === 'not-allowed') markMicDenied();
    throw Object.assign(new Error(kind), { kind });
  }

  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  // Level meter (optional — AudioContext may be unavailable).
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let buf: Uint8Array | null = null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      ctx = new AC();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      buf = new Uint8Array(analyser.fftSize);
    }
  } catch {
    ctx = null;
  }

  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => undefined);
  };

  let resolveStop: (b: Blob | null) => void = () => undefined;
  const stopped = new Promise<Blob | null>((r) => (resolveStop = r));
  let cancelled = false;
  rec.onstop = () => {
    release();
    resolveStop(cancelled || !chunks.length ? null : new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }));
  };
  rec.start();
  const timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), maxMs);

  return {
    level() {
      if (!analyser || !buf) return 0.3;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      return Math.min(1, peak / 64);
    },
    stop() {
      clearTimeout(timer);
      if (rec.state !== 'inactive') rec.stop();
      return stopped;
    },
    cancel() {
      cancelled = true;
      clearTimeout(timer);
      if (rec.state !== 'inactive') rec.stop();
      else release();
    },
  };
}
