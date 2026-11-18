// Optional AI conversation tutor — client side.
// The browser never holds an API key: it talks to YOUR server (see server/tutor-proxy.mjs),
// configured at build time with VITE_TUTOR_ENDPOINT. When that isn't set, the tutor is
// reported as unavailable and no responses are ever simulated.

export interface TutorMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorRequest {
  scenario: string;
  level: number;
  /** Words or patterns the learner has been struggling with, for adaptive practice. */
  difficulties: string[];
  messages: TutorMessage[];
}

export interface TutorReply {
  /** The tutor's reply: Urdu (Roman + script) with any gentle corrections explained in English. */
  text: string;
}

const endpoint = (import.meta.env.VITE_TUTOR_ENDPOINT as string | undefined)?.trim() || '';

export function tutorConfigured(): boolean {
  return endpoint.length > 0;
}

export async function askTutor(req: TutorRequest, signal?: AbortSignal): Promise<TutorReply> {
  if (!endpoint) throw new Error('The AI tutor is not configured.');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Tutor server error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const data = (await res.json()) as Partial<TutorReply>;
  if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('The tutor server returned an empty reply.');
  return { text: data.text };
}
