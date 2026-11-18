import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAudioState } from '../hooks';
import { href } from '../router';
import { audio, type Playable } from '../services/audio';
import { store, useSettings, useToasts } from '../state/store';
import { IconBack, IconChevron, IconPlay, IconSlow, IconX } from './Icons';

/** English / Roman Urdu / Urdu script, each with correct language and direction. Respects display settings. */
export function PhraseText({
  en,
  roman,
  urdu,
  show,
  size = 'md',
}: {
  en?: string;
  roman?: string;
  urdu?: string;
  /** Override settings for specific parts (true = always show, false = always hide). */
  show?: Partial<Record<'en' | 'roman' | 'urdu', boolean>>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const s = useSettings();
  const showEn = show?.en ?? s.showEnglish;
  const showRoman = show?.roman ?? s.showRoman;
  const showUrdu = show?.urdu ?? s.showUrdu;
  const scale = size === 'lg' ? 1.25 : size === 'sm' ? 0.92 : 1;
  return (
    <div style={{ fontSize: `${scale}em` }}>
      {roman && showRoman && (
        <div className="roman" lang="ur-Latn">
          {roman}
        </div>
      )}
      {urdu && showUrdu && (
        <div className="urdu" lang="ur" dir="rtl">
          {urdu}
        </div>
      )}
      {en && showEn && (
        <div className="en" lang="en">
          {en}
        </div>
      )}
    </div>
  );
}

/** Model audio controls. Says honestly where the audio comes from (or that there is none). */
export function PlayButtons({ item, compact, autoPlay }: { item: Playable; compact?: boolean; autoPlay?: boolean }) {
  const { voice, speaking } = useAudioState();
  const [msg, setMsg] = useState<string | null>(null);
  const source = audio.sourceFor(item);
  const played = useRef(false);

  const play = async (slow = false) => {
    setMsg(null);
    const r = await audio.play(item, { slow });
    if (r === 'unavailable') setMsg('No Urdu voice is available on this device. Read the Roman Urdu aloud instead.');
    else if (r === 'error') setMsg("Audio couldn't play. You can keep going without it.");
  };

  useEffect(() => {
    if (autoPlay && !played.current && source !== 'none') {
      played.current = true;
      void audio.play(item);
    }
  }, [autoPlay, item, source]);

  if (source === 'none') {
    if (compact) {
      return (
        <span className="source-badge" role="note" title="No Urdu voice on this device" aria-label="No Urdu voice on this device">
          🔇
        </span>
      );
    }
    return (
      <p className="source-badge" role="note">
        🔇 No Urdu voice on this device, so there's no model audio here.{' '}
        <a href={href('/settings#audio')}>Audio help</a>
      </p>
    );
  }
  return (
    <div>
      <div className="model-row">
        <button className={`btn ${compact ? 'small' : ''}`} onClick={() => play(false)} aria-label="Play model pronunciation">
          <IconPlay /> {compact ? 'Play' : 'Listen'}
        </button>
        <button className={`btn ${compact ? 'small' : ''}`} onClick={() => play(true)} aria-label="Play slowly">
          <IconSlow /> Slow
        </button>
        {speaking && (
          <button className="btn small ghost" onClick={() => audio.stop()}>
            Stop
          </button>
        )}
        {!compact && (
          <span className="source-badge">
            {source === 'recording' ? '🔊 Pakistani Urdu voice' : `🤖 Synthesized voice${voice ? ` (${voice.name})` : ''}`}
          </span>
        )}
      </div>
      {msg && (
        <p className="small muted" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

export function Modal({ title, children, onClose, labelledBy = 'modal-title' }: { title: string; children: ReactNode; onClose: () => void; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [href], input, select')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        <h2 id={labelledBy}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirm,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="muted">{body}</div>
      <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
          {confirm}
        </button>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id} role="status">
          <span style={{ fontSize: '1.5rem' }} aria-hidden>
            {t.icon}
          </span>
          <div className="grow">
            <strong>{t.title}</strong>
            {t.body && <div className="small">{t.body}</div>}
          </div>
          <button className="icon-btn" style={{ color: 'inherit' }} aria-label="Dismiss" onClick={() => store.toasts.dismiss(t.id)}>
            <IconX />
          </button>
        </div>
      ))}
    </div>
  );
}

export function PageHead({ title, backTo, actions }: { title: string; backTo?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="row">
        {backTo && (
          <a className="icon-btn" href={href(backTo)} aria-label="Back">
            <IconBack />
          </a>
        )}
        <h1>{title}</h1>
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </header>
  );
}

export function CardLink({ to, icon, title, sub, accent, right }: { to: string; icon: ReactNode; title: string; sub?: ReactNode; accent?: boolean; right?: ReactNode }) {
  return (
    <a className="card-link" href={href(to)}>
      <span className={`icon-bubble ${accent ? 'accent' : ''}`} aria-hidden>
        {icon}
      </span>
      <span className="grow">
        <strong>{title}</strong>
        {sub && <div className="small muted">{sub}</div>}
      </span>
      {right}
      <IconChevron className="chev" width={20} height={20} />
    </a>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
