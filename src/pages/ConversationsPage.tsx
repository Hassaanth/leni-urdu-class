import { CardLink, PageHead } from '../components/common';
import { tutorConfigured } from '../services/tutor';
import { useCourse } from '../state/course';
import { useProgress } from '../state/store';

export function ConversationsPage() {
  const { course } = useCourse();
  const done = useProgress((s) => s.conversations);
  return (
    <>
      <PageHead title="Conversations" />
      <p className="muted">Role-play real situations. Listen to each line, then choose or say your reply. The conversation changes with what you say.</p>
      {course.levels.map((lvl) => {
        const list = course.conversations.filter((c) => c.level === lvl.id);
        if (!list.length) return null;
        return (
          <section key={lvl.id}>
            <h2>
              Level {lvl.id}: {lvl.title}
            </h2>
            {list.map((c) => (
              <CardLink
                key={c.id}
                to={`/talk/${c.id}`}
                icon={c.emoji}
                title={c.title}
                sub={c.goal}
                right={done[c.id] ? <span className="chip green">✓ {done[c.id].times}×</span> : undefined}
              />
            ))}
          </section>
        );
      })}
      <h2>AI conversation tutor</h2>
      <CardLink
        to="/talk/tutor"
        icon="🤖"
        title="Free conversation with a tutor"
        sub={tutorConfigured() ? 'Connected to your tutor server' : 'Optional — needs a tutor server to be set up (not configured)'}
      />
    </>
  );
}
