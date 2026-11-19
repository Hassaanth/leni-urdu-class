# Leni Urdu Class — learn to speak conversational Urdu

A mobile-first PWA (React + TypeScript + Vite) for English speakers learning everyday Pakistani Urdu. Roman Urdu comes first, with Urdu script (Nastaliq, RTL) and English alongside. You can switch each one on or off.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # browser tests (Playwright, uses installed Chrome; PW_CHANNEL=msedge to switch)
npm run build        # production build in dist/ (includes the service worker)
npm run preview      # serve the build on :4173
```

## What's inside

- **Curriculum** (`public/content/`, JSON, validated at load): 6 levels, 8 units, 24 lessons with 8–12 phrases each, 12 branching conversations, 11 pronunciation drills, 14 spoken questions, 8 read-aloud passages, and daily speaking themes. To add a lesson, add a unit file and list it in `course.json`; you don't need to rebuild. `npm run validate-content` checks all of it.
- **Lesson engine** (`src/lib/exercises.ts`, `src/components/SessionRunner.tsx`) turns phrase data into exercises: multiple choice, listening, matching, word order, typed translation, fill-in, conversation completion, flashcards, repeat-after-me, spoken Q&A and read-aloud. Answers are scored for real, and a wrong answer comes back at the end of the lesson.
- **Answer matching** (`src/lib/text.ts`): accepts Roman spelling variants (kya/kia, theek/thik, hain/hein…). Gender and number changes (raha/rahi, hai/hain) are not accepted; the learner gets a hint instead.
- **Speaking** (`src/components/SpeakPanel.tsx`, `src/services/`). The app uses the best option the browser supports:
  1. Browser speech recognition (`ur-PK`), only after the learner consents in the app.
  2. Record & compare (MediaRecorder). The recording stays in memory and is never uploaded or saved.
  3. Self-check.

  Feedback describes what speech recognition heard. It never gives a pronunciation score. Recognition and microphone failures don't count against progress or mastery.
- **Speaking games**: Say It to Unlock It, Three-Try, Daily Challenge, Speak From Memory, Quick Response, Shadowing and Conversation Response.
- **Progress** (`src/lib/progress.ts`, `srs.ts`, `dates.ts`): XP, local-date streaks, a speaking streak, a daily minutes goal, achievements, and Leitner-style spaced repetition that explains its schedule. Progress is saved in localStorage behind a storage adapter, so sync can be added later.
- **PWA**: manifest, icons and a service worker generated at build time (`src/sw-template.js`). The app shell and lessons work offline.

## Limitations (honest)

- **Audio uses Microsoft's neural Pakistani Urdu voices** (Uzma, female; Asad, male, for male characters), generated into `public/content/audio/` by `npm run audio` (needs `pip install edge-tts`; re-run after editing content). There's a clip for every sentence and every individual word (tap a word to hear it). The voices are synthesized, not recordings of a person, and come from the free Edge read-aloud service, which is meant for personal use; for a larger public product, regenerate them through Azure Speech. Audio needs a connection; lessons work offline.
- **Speech recognition depends on the browser.** It works in Chrome and Edge (online) and in Safari on iOS 14.5+, but often not in iPhone Home Screen apps, so there the mic defaults to Record & compare (open the link in Safari for speech checking). Firefox doesn't support it. Speech-to-text can mishear correct speech.
- **No phoneme-level pronunciation assessment** is configured.
- **Content was written carefully for learners but has not been reviewed by native-speaker teachers.**
- **Progress is per device.** There's no account or sync.
- **The AI tutor is optional and off by default.** `server/tutor-proxy.mjs` keeps the API key on the server (`cd server && npm install`, then `ANTHROPIC_API_KEY=… TUTOR_ALLOWED_ORIGIN=… npm start`). Build the app with `VITE_TUTOR_ENDPOINT=https://your-server/api/tutor`. It has not been run against the live API.

## Test on an iPhone

Speech and the microphone need HTTPS. Deploy the build (below), open it in Safari, then use Share → Add to Home Screen. Alternatively, run `npm run dev` and open it through an HTTPS tunnel. The app has **not** been tested on a real iPhone. The automated tests use an iPhone-sized Chromium viewport with simulated speech recognition.

## Deploy

Live at **https://hassaanth.github.io/leni-urdu-class/** (GitHub Pages, served from the `gh-pages` branch). To publish an update: `npm run build`, then push the contents of `dist/` (plus an empty `.nojekyll` file) to the `gh-pages` branch. Any static host works too; the app uses hash routing and relative paths, so it needs no rewrites. Serve it over HTTPS.
