import { useState } from 'react';
import { CardLink, PageHead, PhraseText } from '../components/common';
import { SpeakPanel } from '../components/SpeakPanel';
import { useName, usePracticeTimer, useStopAudioOnUnmount } from '../hooks';
import { useCourse } from '../state/course';
import { useProgress } from '../state/store';

export function PronunciationListPage() {
  const { course } = useCourse();
  const byPhrase = useProgress((s) => s.speaking.byPhrase);
  return (
    <>
      <PageHead title="Pronunciation" backTo="/speak" />
      <p className="muted">Focused drills for the sounds English speakers find hardest. Start at the top — they're ordered from easiest to trickiest.</p>
      <div className="banner">
        Model audio here is synthesized by your device (when an Urdu voice is installed), so treat it as a guide rather than perfect native pronunciation.
      </div>
      {course.pronunciation.map((d) => {
        const practiced = d.items.filter((_, i) => byPhrase[`${d.id}#${i}`]?.attempts).length;
        return (
          <CardLink
            key={d.id}
            to={`/speak/pronunciation/${d.id}`}
            icon="👄"
            title={d.title}
            sub={`${d.focus} · ${practiced}/${d.items.length} practised`}
          />
        );
      })}
    </>
  );
}

export function PronunciationDrillPage({ id }: { id: string }) {
  const { course } = useCourse();
  usePracticeTimer(true);
  useStopAudioOnUnmount();
  const name = useName();
  const drill = course.pronunciation.find((d) => d.id === id);
  const [i, setI] = useState(0);
  if (!drill) {
    return (
      <>
        <PageHead title="Drill not found" backTo="/speak/pronunciation" />
      </>
    );
  }
  const item = drill.items[i];
  return (
    <>
      <PageHead title={drill.title} backTo="/speak/pronunciation" />
      <div className="note" style={{ marginTop: 0 }}>
        <strong>Tip:</strong> {drill.tip}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Item {i + 1} of {drill.items.length}
      </p>
      <div className="phrase-card">
        <PhraseText roman={item.roman} urdu={item.urdu} en={item.en} show={{ roman: true, urdu: true, en: true }} size="lg" />
        {item.guide && (
          <p className="small" style={{ marginTop: 8 }}>
            🗣️ <strong>Say it like:</strong> <span lang="ur-Latn">{item.guide}</span>
          </p>
        )}
      </div>
      <SpeakPanel
        phraseKey={`${drill.id}#${i}`}
        label={item.roman}
        targets={[{ roman: item.roman, urdu: item.urdu }]}
        model={{ urdu: item.urdu }}
        name={name}
      />
      <p className="honesty">
        Speech recognition checks which word it heard, which is a rough signal only. Minimal pairs (like kam / kaam) are hard for recognisers — trust your ears and
        compare your recording with the model.
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
          Previous
        </button>
        {i < drill.items.length - 1 ? (
          <button className="btn primary grow" onClick={() => setI(i + 1)}>
            Next
          </button>
        ) : (
          <a className="btn primary grow" href="#/speak/pronunciation">
            Finish drill
          </a>
        )}
      </div>
    </>
  );
}
