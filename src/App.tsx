import { useEffect } from 'react';
import { Toasts } from './components/common';
import { IconBook, IconChart, IconChat, IconLearn, IconLogo, IconMic, IconPractice, IconSettings } from './components/Icons';
import { ConversationPlayer } from './pages/ConversationPlayer';
import { ConversationsPage } from './pages/ConversationsPage';
import { LearnPage } from './pages/LearnPage';
import { LessonPage } from './pages/LessonPage';
import { PracticePage, PracticeSessionPage } from './pages/PracticePage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';
import { SpeakGamePage } from './pages/SpeakGames';
import { StartPage } from './pages/StartPage';
import { PronunciationDrillPage, PronunciationListPage } from './pages/PronunciationPage';
import { ReadAloudListPage, ReadAloudPage, RepeatPage, SpokenQAPage, SpeakPage } from './pages/SpeakPage';
import { TutorPage } from './pages/TutorPage';
import { VocabularyPage } from './pages/VocabularyPage';
import { href, useRoute } from './router';
import { CourseProvider } from './state/course';
import { useSettings } from './state/store';

const NAV = [
  { to: '/learn', label: 'Learn', icon: IconLearn },
  { to: '/practice', label: 'Practice', icon: IconPractice },
  { to: '/speak', label: 'Speak', icon: IconMic, speak: true },
  { to: '/talk', label: 'Talk', icon: IconChat },
  { to: '/words', label: 'Words', icon: IconBook },
];
const SIDE_EXTRA = [
  { to: '/progress', label: 'Progress', icon: IconChart },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

function Page() {
  const { parts } = useRoute();
  const [a, b, c] = parts;
  switch (a) {
    case 'start':
      return <StartPage />;
    case 'lesson':
      return <LessonPage id={b} />;
    case 'practice':
      return b ? <PracticeSessionPage mode={b} /> : <PracticePage />;
    case 'speak':
      if (!b) return <SpeakPage />;
      if (b === 'repeat') return <RepeatPage lessonId={c} />;
      if (b === 'pronunciation') return c ? <PronunciationDrillPage id={c} /> : <PronunciationListPage />;
      if (b === 'qa') return <SpokenQAPage />;
      if (b === 'read') return c ? <ReadAloudPage id={c} /> : <ReadAloudListPage />;
      if (b === 'game') return <SpeakGamePage game={c} />;
      return <SpeakPage />;
    case 'talk':
      if (b === 'tutor') return <TutorPage />;
      return b ? <ConversationPlayer id={b} /> : <ConversationsPage />;
    case 'words':
      return <VocabularyPage />;
    case 'progress':
      return <ProgressPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <LearnPage />;
  }
}

export function App() {
  const settings = useSettings();
  const { path } = useRoute();
  const section = '/' + (path.split('/')[1] ?? 'learn');

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(settings.textScale));
    document.documentElement.classList.toggle('reduce-motion', settings.motion === 'reduce');
  }, [settings.textScale, settings.motion]);

  // New screen: start at the top (anchors like #/settings#audio scroll themselves afterwards).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  useEffect(() => {
    const titles: Record<string, string> = {
      '/learn': 'Learn',
      '/practice': 'Practice',
      '/speak': 'Speak',
      '/talk': 'Conversations',
      '/words': 'Vocabulary',
      '/progress': 'Progress',
      '/settings': 'Settings',
      '/lesson': 'Lesson',
    };
    document.title = `${titles[section] ?? 'Learn'} · Leni Urdu Class`;
  }, [section]);

  const isCurrent = (to: string) => (section === to || (to === '/learn' && section === '/lesson') ? 'page' : undefined);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <nav className="side-nav" aria-label="Main">
        <div className="brand">
          <span className="brand-mark">
            <IconLogo width={22} height={22} />
          </span>
          Leni Urdu Class
        </div>
        {[...NAV, ...SIDE_EXTRA].map((n) => (
          <a key={n.to} href={href(n.to)} aria-current={isCurrent(n.to)}>
            <n.icon /> {n.label}
          </a>
        ))}
      </nav>
      <main className="main" id="main" tabIndex={-1}>
        <CourseProvider>
          {/* Keyed by path so each screen starts with fresh state. */}
          <Page key={path} />
        </CourseProvider>
      </main>
      <nav className="bottom-nav" aria-label="Main">
        <ul>
          {NAV.map((n) => (
            <li key={n.to}>
              <a className={`nav-link ${n.speak ? 'nav-speak' : ''}`} href={href(n.to)} aria-current={isCurrent(n.to)}>
                {n.speak ? (
                  <span className="nav-mic">
                    <n.icon />
                  </span>
                ) : (
                  <n.icon />
                )}
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <Toasts />
    </div>
  );
}
