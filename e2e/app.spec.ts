import { expect, test } from '@playwright/test';
import { answerCurrentExercise, installFakeRecognition, queueSpeech, removeRecognitionAndRecorder, seedSettings } from './helpers';

test.describe('core flows', () => {
  test('onboarding, then every main area opens without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
    await page.getByPlaceholder('e.g. Sara').fill('Sara');
    await page.getByRole('button', { name: 'Feminine (-i)' }).click();
    await page.getByRole('button', { name: "Let's start" }).click();
    await expect(page.getByRole('heading', { name: 'Start here' })).toBeVisible();

    const nav = page.locator('.bottom-nav');
    for (const [label, heading] of [
      ['Practice', 'Practice'],
      ['Speak', 'Speak'],
      ['Talk', 'Conversations'],
      ['Words', 'Vocabulary'],
    ]) {
      await nav.getByRole('link', { name: label }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
    await page.goto('/#/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('completes the "Introducing Yourself" lesson and progress survives a reload', async ({ page }) => {
    await installFakeRecognition(page);
    await seedSettings(page, { learnerName: 'Sara', learnerGender: 'feminine', recognitionConsent: 'granted' });
    await page.goto('/#/lesson/l1-intro');
    await page.getByRole('button', { name: 'Start lesson' }).click();
    const kinds = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const k = await answerCurrentExercise(page);
      if (!k) break;
      kinds.add(k);
    }
    await expect(page.getByRole('heading', { name: 'Lesson complete!' })).toBeVisible();
    for (const k of ['intro', 'mcq', 'listen', 'match', 'order', 'translate', 'complete', 'fill', 'repeat', 'spokenQA', 'readAloud']) expect(kinds).toContain(k);
    await expect(page.getByText('100%')).toBeVisible(); // all first-try correct

    const xp = await page.evaluate(() => JSON.parse(localStorage.getItem('bolo-urdu:v1')!).xp);
    expect(xp).toBeGreaterThan(0);
    await page.reload();
    await page.goto('/#/learn');
    await expect(page.getByText(`${xp}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`1/${60}`)).toBeVisible();
  });

  test('first word lesson: four words with pictures, practised until known', async ({ page }) => {
    await installFakeRecognition(page);
    await seedSettings(page, { recognitionConsent: 'granted' });
    await page.goto('/#/learn');
    await page.getByRole('link', { name: /Hello & thank you/ }).first().click();
    await page.getByRole('button', { name: 'Start lesson' }).click();
    await expect(page.locator('.ex-kicker')).toHaveText('New word');
    await expect(page.locator('.word-pic')).toHaveText('👋');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('.picture-grid .option.picture')).toHaveCount(3);
    const kinds = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const k = await answerCurrentExercise(page);
      if (!k) break;
      kinds.add(k);
    }
    await expect(page.getByRole('heading', { name: 'Lesson complete!' })).toBeVisible();
    for (const k of ['intro', 'mcq', 'listen', 'match', 'repeat']) expect(kinds).toContain(k);
    const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('bolo-urdu:v1')!).cards);
    for (const id of ['v-salaam', 'v-shukriya', 'v-haan', 'v-nahi']) expect(cards[id].correct).toBeGreaterThan(0);
  });

  test('Building Blocks lesson 1: words, pattern, building sentences, conversation', async ({ page }) => {
    await installFakeRecognition(page);
    await seedSettings(page, { learnerName: 'Sara', learnerGender: 'feminine', recognitionConsent: 'granted' });
    await page.goto('/#/learn');
    await expect(page.getByText('I am…').first()).toBeVisible();
    await page.goto('/#/lesson/b1');
    await expect(page.getByText("The pattern you'll master")).toBeVisible();
    await page.getByRole('button', { name: 'Start lesson' }).click();
    const kinds = new Set<string>();
    for (let i = 0; i < 90; i++) {
      const k = await answerCurrentExercise(page);
      if (!k) break;
      kinds.add(k);
    }
    await expect(page.getByRole('heading', { name: 'Lesson complete!' })).toBeVisible();
    for (const k of ['dialogue', 'intro', 'pattern', 'order', 'say', 'repeat']) expect(kinds).toContain(k);
    const cards = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('bolo-urdu:v1')!).cards));
    expect(cards).toContain('w-khush');
    expect(cards).toContain('s-b1-3');
  });

  test('wrong answers are explained and come back at the end', async ({ page }) => {
    await seedSettings(page, { learnStyle: 'see' });
    await page.goto('/#/lesson/l2-numbers');
    await page.getByRole('button', { name: 'Start lesson' }).click();
    // advance through intro cards to the first multiple-choice question
    for (let i = 0; i < 10; i++) {
      if (await page.locator('.ex-kicker', { hasText: 'Choose the answer' }).count()) break;
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    const total = await page.locator('.session-top > span').innerText();
    // pick an option that is wrong (read the answer index from the page props)
    const wrongIndex = await page.evaluate(() => {
      const el = document.querySelector('.session-body > :not(.teacher)')!;
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let f: any = (el as any)[key];
      while (!f.memoizedProps?.ex) f = f.return;
      return (f.memoizedProps.ex.answer + 1) % f.memoizedProps.ex.options.length;
    });
    await page.locator('.session-body .options button.option').nth(wrongIndex).click();
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText('Not quite')).toBeVisible();
    await expect(page.getByText('This one will come back at the end.')).toBeVisible();
    const after = await page.locator('.session-top > span').innerText();
    expect(Number(after.split('/')[1])).toBe(Number(total.split('/')[1]) + 1);
  });

  test('typed answers accept spelling variants but explain gender endings', async ({ page }) => {
    await seedSettings(page);
    await page.goto('/#/practice/recall');
    const prompt = page.locator('.ex-title');
    await expect(prompt).toBeVisible();
    // Answer whatever is asked using a spelling variant of the accepted answer when possible.
    const accepted: string[] = await page.evaluate(() => {
      const el = document.querySelector('.session-body > :not(.teacher)')!;
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let f: any = (el as any)[key];
      while (!f.memoizedProps?.ex) f = f.return;
      return f.memoizedProps.ex.accepted;
    });
    const variant = accepted[0].toLowerCase().replace(/[?.!,]/g, '').replace('{name}', 'Sara').replace(/aa/g, 'a').replace(/ee/g, 'i');
    await page.locator('textarea').fill(variant);
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.locator('.feedback-title')).toContainText(/Correct/);
  });
});

test.describe('speaking', () => {
  test('asks for consent, shows a listening state, and reports recognition honestly', async ({ page }) => {
    await installFakeRecognition(page);
    await seedSettings(page);
    await page.goto('/#/speak/repeat/l1-intro');
    await page.getByRole('button', { name: 'Tap and speak' }).click();
    await expect(page.getByRole('dialog', { name: 'Use speech recognition?' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __speechStarts: number }).__speechStarts)).toBe(0); // no mic before consent
    await page.getByRole('button', { name: 'Allow speech recognition' }).click();

    await queueSpeech(page, { alts: ['السلام علیکم'] });
    await page.getByRole('button', { name: 'Tap and speak' }).click();
    await expect(page.getByText('Microphone on — speak now')).toBeVisible();
    await expect(page.getByText('We recognized your phrase.')).toBeVisible();
    await expect(page.getByText(/not a pronunciation score/)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __speechLang: string }).__speechLang)).toBe('ur-PK');

    await queueSpeech(page, { alts: ['کیا حال ہے'] });
    await page.getByRole('button', { name: 'Tap to try again' }).click();
    await expect(page.getByText("Your spoken answer may be correct, but we couldn't verify it.")).toBeVisible();

    await queueSpeech(page, { error: 'no-speech' });
    await page.getByRole('button', { name: 'Tap to try again' }).click();
    await expect(page.getByText("We couldn't recognize that attempt.")).toBeVisible();

    await queueSpeech(page, { error: 'network' });
    await page.getByRole('button', { name: 'Tap to try again' }).click();
    await expect(page.getByText("Speech recognition couldn't reach its service.")).toBeVisible();
    await expect(page.getByText("This won't count against your progress.")).toBeVisible();

    // Recognition failures never change the review schedule
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('bolo-urdu:v1')!));
    expect(state.cards['p-salaam']).toBeUndefined();
    expect(state.speaking.recognitionErrors).toBe(1);
    expect(state.speaking.byPhrase['p-salaam'].attempts).toBe(3);
  });

  test('permission denial falls back to self-practice without re-prompting', async ({ page }) => {
    await installFakeRecognition(page);
    await seedSettings(page, { recognitionConsent: 'granted' });
    await page.goto('/#/speak/repeat/l1-intro');
    await queueSpeech(page, { error: 'not-allowed' });
    await page.getByRole('button', { name: 'Tap and speak' }).click();
    await expect(page.getByText('Microphone or speech recognition is blocked.')).toBeVisible();
    await page.getByRole('button', { name: 'Practise without the mic' }).click();
    await expect(page.getByText('Say it out loud now.')).toBeVisible();
    await page.getByRole('button', { name: '😊 Sounded right' }).click();
    await expect(page.getByText('Saved as practised.')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __speechStarts: number }).__speechStarts)).toBe(1);
  });

  test('works with no speech recognition and no recorder (self-check mode)', async ({ page }) => {
    await removeRecognitionAndRecorder(page);
    await seedSettings(page);
    await page.goto('/#/speak/repeat/l1-intro');
    await expect(page.getByRole('button', { name: 'Say it aloud' })).toBeVisible();
    await expect(page.getByText(/check yourself against the example/)).toBeVisible();
    await page.goto('/#/speak');
    await expect(page.getByText('Not available in this browser')).toBeVisible();
  });

  test('spoken question accepts alternative answers and any name', async ({ page }) => {
    await installFakeRecognition(page);
    await seedSettings(page, { recognitionConsent: 'granted' });
    await page.goto('/#/speak/qa');
    await queueSpeech(page, { alts: ['میرا نام زینب ہے'] });
    await page.getByRole('button', { name: 'Tap and speak' }).click();
    await expect(page.getByText('We recognized your phrase.')).toBeVisible();
  });

  test('daily speaking challenge counts genuine attempts', async ({ page }) => {
    await installFakeRecognition(page);
    await seedSettings(page, { recognitionConsent: 'granted' });
    await page.goto('/#/speak/game/daily');
    await queueSpeech(page, { alts: ['something else entirely'] });
    await page.getByRole('button', { name: 'Tap and speak' }).click();
    await expect(page.getByText('1/5 said aloud')).toBeVisible(); // rewarded even though not recognized
  });
});

test.describe('conversations', () => {
  test('a role-play branches on replies and can be completed', async ({ page }) => {
    await seedSettings(page);
    await page.goto('/#/talk/c-first-meeting');
    await page.getByRole('button', { name: /Khuda hafiz!/ }).click();
    await expect(page.getByText("❌ That doesn't fit")).toBeVisible();
    await page.getByRole('button', { name: 'Try another reply' }).click();
    for (const reply of [/^Wa alaikum assalam!/, /^Mera naam/, /^Main theek hoon, shukriya/, /^Mujhe samajh nahi aaya/, /^Main London se hoon/, /^Ji, phir milenge/]) {
      await page.getByRole('button', { name: reply }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    await expect(page.getByRole('heading', { name: 'Conversation complete' })).toBeVisible();
    await expect(page.getByText('Natural replies')).toBeVisible();
  });
});

test.describe('pwa', () => {
  test('manifest, icons and offline lessons', async ({ page, context }) => {
    await seedSettings(page);
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) expect((await page.request.get('/' + icon.src)).ok()).toBe(true);

    await page.goto('/#/learn');
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active);
    await page.reload(); // now controlled by the service worker
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.goto('/#/lesson/l3-food');
    await expect(page.getByRole('heading', { name: 'Food & Drink' })).toBeVisible();
    await page.goto('/#/settings');
    await expect(page.getByText('Offline', { exact: true })).toBeVisible();
    await context.setOffline(false);
  });
});
