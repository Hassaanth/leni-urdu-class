// Optional AI tutor backend for Leni Urdu Class.
//
// Keeps the Anthropic API key on the server and exposes one endpoint:
//   POST /api/tutor  { scenario, level, difficulties[], messages[] }  ->  { text }
//
// Setup:
//   cd server && npm install
//   ANTHROPIC_API_KEY=... TUTOR_ALLOWED_ORIGIN=https://your-app.example node tutor-proxy.mjs
// Then build the app with VITE_TUTOR_ENDPOINT=https://your-server.example/api/tutor
//
// Not needed for lessons, scripted conversations or speaking practice.
import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const ALLOWED_ORIGIN = process.env.TUTOR_ALLOWED_ORIGIN ?? 'http://localhost:5173';
const MAX_TURNS = 40;
const MAX_CHARS = 2000;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY (or other configured credentials)

const SYSTEM_PROMPT = `You are a warm, patient conversation partner helping an English speaker practise everyday spoken Urdu (natural Pakistani conversational usage).

Role-play the scenario you are given, staying in character, and keep the conversation going with one relevant follow-up question per reply.

Format every reply as:
1. Your line in Roman Urdu (beginner-friendly spelling such as "Aap kaise hain?").
2. The same line in Urdu script on the next line.
3. When the learner made a mistake or said something unnatural, a short "Tip:" in plain English: give the more natural version and explain the reason briefly (gender agreement, politeness with aap/tum, word order). Correct at most one thing per reply, gently.
4. When the learner seems lost, add a short English gloss of your line in brackets.

Match the difficulty to the learner's level (1 = absolute beginner, 6 = advanced): short simple sentences at low levels, more natural speed and idioms at high levels. If the learner says they don't understand, rephrase more simply. Keep replies short — this is a spoken conversation.`;

function bad(res, status, message) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': ALLOWED_ORIGIN });
  res.end(JSON.stringify({ error: message }));
}

function validate(body) {
  if (!body || typeof body !== 'object') return 'Body must be JSON.';
  if (typeof body.scenario !== 'string' || body.scenario.length > 300) return 'scenario must be a short string.';
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > MAX_TURNS) return 'messages must be a non-empty list.';
  for (const m of body.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || m.content.length > MAX_CHARS) return 'Invalid message.';
  }
  if (body.messages[0].role !== 'user') return 'The first message must come from the learner.';
  return null;
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': ALLOWED_ORIGIN,
      'access-control-allow-methods': 'POST',
      'access-control-allow-headers': 'content-type',
    });
    return res.end();
  }
  if (req.method !== 'POST' || req.url !== '/api/tutor') return bad(res, 404, 'Not found');

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200_000) return bad(res, 413, 'Request too large');
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return bad(res, 400, 'Invalid JSON');
  }
  const problem = validate(body);
  if (problem) return bad(res, 400, problem);

  const level = Number.isInteger(body.level) ? Math.min(6, Math.max(1, body.level)) : 1;
  const difficulties = Array.isArray(body.difficulties) ? body.difficulties.filter((d) => typeof d === 'string').slice(0, 10) : [];
  const context = `Scenario: ${body.scenario}\nLearner level: ${level}\n${difficulties.length ? `Things the learner has found hard recently: ${difficulties.join(', ')}` : ''}`;

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low' }, // short conversational turns
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }, { type: 'text', text: context }],
      messages: body.messages,
    });
    if (response.stop_reason === 'refusal') return bad(res, 422, 'The tutor declined to answer that. Try rephrasing.');
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) return bad(res, 502, 'Empty reply from the model.');
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': ALLOWED_ORIGIN });
    res.end(JSON.stringify({ text }));
  } catch (err) {
    // Log the status only — never request bodies or keys.
    if (err instanceof Anthropic.RateLimitError) return bad(res, 429, 'The tutor is busy. Try again in a moment.');
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('Tutor: authentication failed — check ANTHROPIC_API_KEY');
      return bad(res, 503, 'Tutor is not configured correctly.');
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Tutor: API error ${err.status}`);
      return bad(res, 502, 'The tutor service had a problem.');
    }
    console.error('Tutor: unexpected error', err?.name);
    return bad(res, 500, 'Unexpected server error.');
  }
}).listen(PORT, () => console.log(`Leni Urdu Class tutor proxy on http://localhost:${PORT}/api/tutor (allowing ${ALLOWED_ORIGIN})`));
