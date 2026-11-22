import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { buildIndexes, loadCourse, type CourseIndexes } from '../content/loader';
import type { Character, Course } from '../types';
import { store } from './store';

interface CourseCtx {
  course: Course;
  idx: CourseIndexes;
  issues: string[];
}

const Ctx = createContext<CourseCtx | null>(null);

export function CourseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CourseCtx | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCourse()
      .then(({ course, issues }) => {
        if (cancelled) return;
        if (issues.length) console.warn('Content issues (invalid items were skipped):', issues);
        const idx = buildIndexes(course);
        store.setAchievementContext({
          unitLessonIds: course.units.map((u) => u.lessons.map((l) => l.id)),
          conversationCount: course.conversations.length,
        });
        setState({ course, idx, issues });
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="main" role="alert">
        <h1>Couldn't load lessons</h1>
        <p>{navigator.onLine ? error : "You're offline and the lessons haven't been saved for offline use yet. Connect once to download them."}</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="main" aria-busy="true">
        <p className="muted">Loading lessons…</p>
      </main>
    );
  }
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useCourse(): CourseCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCourse outside CourseProvider');
  return c;
}

const LENI: Character = { id: 'leni', name: 'Leni', role: 'your Urdu teacher', avatar: '👩🏽‍🏫', bio: '' };

/** A character from the cast (falls back to Leni). */
export function useCharacter(id?: string): Character {
  const c = useContext(Ctx);
  return c?.course.characters.find((x) => x.id === id) ?? c?.course.characters.find((x) => x.id === 'leni') ?? LENI;
}
