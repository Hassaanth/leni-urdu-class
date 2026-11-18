import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { dateKey } from './lib/dates';
import { addPracticeTime } from './lib/progress';
import { audio } from './services/audio';
import { store, useSettings } from './state/store';

/** Counts active practice time toward the daily goal while an activity screen is open. */
export function usePracticeTimer(active = true) {
  useEffect(() => {
    if (!active) return;
    let lastInteraction = Date.now();
    let pending = 0;
    const touch = () => (lastInteraction = Date.now());
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const tick = setInterval(() => {
      // Only count time when the page is visible and the learner did something in the last 90s.
      if (document.visibilityState === 'visible' && Date.now() - lastInteraction < 90_000) pending += 5;
      if (pending >= 15) {
        const secs = pending;
        pending = 0;
        store.update((s) => addPracticeTime(s, secs, dateKey()));
      }
    }, 5000);
    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, touch));
      if (pending) store.update((s) => addPracticeTime(s, pending, dateKey()));
    };
  }, [active]);
}

let audioVersion = 0;
audio.subscribe(() => audioVersion++);

/** Re-renders when audio playback state or available voices change. */
export function useAudioState() {
  const settings = useSettings();
  useSyncExternalStore(
    (cb) => audio.subscribe(cb),
    () => audioVersion,
  );
  audio.preferredVoiceURI = settings.voiceURI;
  audio.rate = settings.speechRate;
  return { speaking: audio.speaking, voice: audio.voice(), ttsSupported: audio.ttsSupported };
}

/** Stop any playing audio when a screen unmounts. */
export function useStopAudioOnUnmount() {
  useEffect(() => () => audio.stop(), []);
}

/** Today's local date key, recomputed every render so screens stay correct across midnight. */
export function useToday() {
  return dateKey();
}

/** The learner's name for {name} slots, or a sample name until they set one. */
export function useName() {
  const s = useSettings();
  return useMemo(() => s.learnerName.trim() || (s.learnerGender === 'feminine' ? 'Sara' : 'Ali'), [s.learnerName, s.learnerGender]);
}
