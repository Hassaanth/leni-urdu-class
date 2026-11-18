import { useMemo, useState } from 'react';
import { PageHead, PhraseText, PlayButtons, Segmented } from '../components/common';
import { GenderBox } from '../components/exercises';
import { SpeakPanel } from '../components/SpeakPanel';
import { useName, useToday } from '../hooks';
import { displayForm, speechTargets } from '../lib/exercises';
import { explain, isDue, mastery, MASTERY_LABEL, type Mastery } from '../lib/srs';
import { fillSlots, romanKey, romanWords } from '../lib/text';
import { useCourse } from '../state/course';
import { useProgress, useSettings } from '../state/store';
import { WordBreakdown } from '../components/WordBreakdown';

type Filter = 'all' | 'learning' | 'known' | 'due' | 'new';

const chipClass: Record<Mastery, string> = { new: '', learning: 'amber', familiar: 'teal', strong: 'green', mastered: 'green' };

export function VocabularyPage() {
  const { idx } = useCourse();
  const cards = useProgress((s) => s.cards);
  const spoken = useProgress((s) => s.speaking.byPhrase);
  const settings = useSettings();
  const name = useName();
  const today = useToday();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const keyed = romanWords(needle).map(romanKey).join(' ');
    return idx.allPhrases.filter((p) => {
      const c = cards[p.id];
      const m = mastery(c);
      if (filter === 'new' && c) return false;
      if (filter === 'learning' && !(c && (m === 'new' || m === 'learning'))) return false;
      if (filter === 'known' && !['familiar', 'strong', 'mastered'].includes(m)) return false;
      if (filter === 'due' && !(c && isDue(c, today))) return false;
      if (!needle) return true;
      const hay = [p.en, p.roman, ...(p.accept ?? [])].join(' ').toLowerCase();
      const hayKeyed = [p.roman, ...(p.accept ?? [])].map((r) => romanWords(r).map(romanKey).join(' ')).join(' | ');
      return hay.includes(needle) || p.urdu.includes(q.trim()) || (keyed && hayKeyed.includes(keyed));
    });
  }, [q, filter, cards, idx, today]);

  const counts = useMemo(() => {
    const all = Object.values(cards);
    return {
      seen: all.length,
      known: all.filter((c) => ['familiar', 'strong', 'mastered'].includes(mastery(c))).length,
      total: idx.allPhrases.length,
    };
  }, [cards, idx]);

  return (
    <>
      <PageHead title="Vocabulary" />
      <p className="small muted" style={{ marginTop: -8 }}>
        {counts.seen} of {counts.total} phrases started · {counts.known} familiar or better
      </p>
      <label className="sr-only" htmlFor="vocab-search">
        Search vocabulary
      </label>
      <input
        id="vocab-search"
        className="search"
        type="search"
        placeholder="Search English, Roman Urdu or اردو"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
      />
      <div style={{ margin: '10px 0' }}>
        <Segmented
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'due', label: 'Due' },
            { value: 'learning', label: 'Learning' },
            { value: 'known', label: 'Known' },
            { value: 'new', label: 'Not started' },
          ]}
        />
      </div>
      <p className="small muted" role="status">
        {list.length} result{list.length === 1 ? '' : 's'}
      </p>
      <div className="card" style={{ padding: '4px 16px' }}>
        {list.length === 0 && <p className="muted">No phrases match.</p>}
        {list.slice(0, 200).map((p) => {
          const c = cards[p.id];
          const m = mastery(c);
          const f = displayForm(p, settings.learnerGender, name);
          const isOpen = open === p.id;
          return (
            <div key={p.id} className="vocab-item" style={{ display: 'block' }}>
              <button
                className="row"
                style={{ width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : p.id)}
              >
                <div className="grow">
                  <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p.en, name)} size="sm" />
                </div>
                <span className={`chip ${chipClass[m]}`}>{c ? MASTERY_LABEL[m] : 'Not started'}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '8px 0 12px' }}>
                  <PlayButtons item={{ urdu: f.urdu, audio: p.audio }} compact />
                  {p.literal && <p className="small muted">Word for word: {p.literal}</p>}
                  {p.note && <div className="note">{p.note}</div>}
                  {p.genderVariants && <GenderBox phrase={p} name={name} />}
                  <WordBreakdown urdu={f.urdu} />
                  <p className="small" style={{ marginTop: 8 }}>
                    <strong>Lesson:</strong> {idx.lessonByPhrase.get(p.id)?.title}
                  </p>
                  {c ? (
                    <p className="small">
                      <strong>Review:</strong> {explain(c, today)} Correct {c.correct}× · missed {c.incorrect}×.
                    </p>
                  ) : (
                    <p className="small muted">Not introduced yet — it will be added when you reach its lesson.</p>
                  )}
                  {spoken[p.id] && (
                    <p className="small">
                      <strong>Spoken:</strong> {spoken[p.id].attempts} attempt{spoken[p.id].attempts === 1 ? '' : 's'} on {spoken[p.id].days.length} day
                      {spoken[p.id].days.length === 1 ? '' : 's'}
                    </p>
                  )}
                  {p.accept && p.accept.length > 0 && <p className="small muted">Also accepted: {p.accept.slice(0, 4).join(' · ')}</p>}
                  <SpeakPanel phraseKey={p.id} label={f.roman} targets={speechTargets(p)} model={null} showModelButtons={false} name={name} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {list.length > 200 && <p className="small muted">Showing the first 200 — refine your search.</p>}
    </>
  );
}
