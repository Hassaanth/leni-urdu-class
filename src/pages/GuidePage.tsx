// Unit guidebook: plain-English explanations of how the unit's Urdu works, with spoken examples.
import { PageHead, PhraseText, PlayButtons } from '../components/common';
import { WordBreakdown } from '../components/WordBreakdown';
import { useName, useStopAudioOnUnmount } from '../hooks';
import { displayForm } from '../lib/exercises';
import { fillSlots } from '../lib/text';
import { href } from '../router';
import { useCharacter, useCourse } from '../state/course';
import { useSettings } from '../state/store';

export function GuidePage({ unitId }: { unitId?: string }) {
  const { course, idx } = useCourse();
  useStopAudioOnUnmount();
  const settings = useSettings();
  const name = useName();
  const unit = course.units.find((u) => u.id === unitId);
  const host = useCharacter(unit?.host);
  if (!unit || !unit.guide) {
    return <PageHead title="Guidebook not found" backTo="/learn" />;
  }
  const first = unit.lessons[0];
  return (
    <>
      <PageHead title="Guidebook" backTo="/learn" />
      <div className="chapter">
        <span className="chapter-avatar" aria-hidden>
          {host.avatar}
        </span>
        <div>
          <div className="small" style={{ fontWeight: 800, color: 'var(--accent)' }}>
            {unit.chapter}
          </div>
          <h2 style={{ margin: 0 }}>{unit.title}</h2>
        </div>
      </div>
      <p className="muted">Read this before or after the unit's lessons. Tap 🔊 to hear {host.name} say each example.</p>
      {unit.guide.map((g, i) => (
        <section key={i} className="card" style={{ marginTop: 12 }}>
          <h3>{g.title}</h3>
          <p>{g.body}</p>
          {g.examples
            .map((id) => idx.phraseById.get(id))
            .filter((p) => !!p)
            .map((p) => {
              const f = displayForm(p!, settings.learnerGender, name);
              return (
                <div key={p!.id} className="tip-example">
                  <PhraseText roman={f.roman} urdu={f.urdu} en={fillSlots(p!.en, name)} show={{ en: true, roman: true }} />
                  <div style={{ marginTop: 6 }}>
                    <PlayButtons item={{ urdu: f.urdu, audio: p!.audio, voice: unit.host }} compact />
                  </div>
                  <WordBreakdown urdu={f.urdu} />
                </div>
              );
            })}
        </section>
      ))}
      {first && (
        <a className="btn primary block" style={{ marginTop: 16 }} href={href(`/lesson/${first.id}`)}>
          Start the first lesson of this chapter
        </a>
      )}
    </>
  );
}
