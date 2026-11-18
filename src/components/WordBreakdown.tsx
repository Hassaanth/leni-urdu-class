// Splits an Urdu sentence into words: tap a word to hear it and see its Roman spelling and meaning.
import { useEffect, useState } from 'react';
import { normalizeUrdu } from '../lib/text';
import { audio } from '../services/audio';

type Gloss = Record<string, [roman: string, en: string]>;
let cache: Promise<Gloss> | null = null;
function loadGlossary(): Promise<Gloss> {
  cache ??= fetch('./content/glossary.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((g: Gloss) => Object.fromEntries(Object.entries(g).map(([k, v]) => [normalizeUrdu(k), v])))
    .catch(() => ({}));
  return cache;
}

export function WordBreakdown({ urdu, label = 'Tap a word to hear it' }: { urdu: string; label?: string }) {
  const [gloss, setGloss] = useState<Gloss>({});
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    void loadGlossary().then(setGloss);
  }, []);
  const words = normalizeUrdu(urdu).split(' ').filter((w) => /[؀-ۿ]/.test(w));
  if (words.length < 2) return null;
  return (
    <div className="words">
      <div className="small muted">{label}</div>
      <div className="word-chips" dir="rtl">
        {words.map((w, i) => {
          const g = gloss[w];
          return (
            <button
              key={i}
              className={`word-chip ${active === i ? 'on' : ''}`}
              onClick={() => {
                setActive(i);
                void audio.play({ urdu: w });
              }}
              aria-label={`${g ? g[0] : w}${g ? `, ${g[1]}` : ''}. Play`}
            >
              <span className="urdu" lang="ur">
                {w}
              </span>
              {g && (
                <span className="wc-roman" lang="ur-Latn" dir="ltr">
                  {g[0]}
                </span>
              )}
              {g && (
                <span className="wc-en" dir="ltr">
                  {g[1]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
