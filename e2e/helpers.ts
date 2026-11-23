import type { Page } from '@playwright/test';

/**
 * Replaces the browser's speech recognition with a scripted fake, so speaking flows can be
 * tested without a microphone. Push results with `queueSpeech(page, ...)`.
 */
export async function installFakeRecognition(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__speechQueue = [];
    w.__speechStarts = 0;
    class FakeRecognition {
      lang = '';
      onstart: (() => void) | null = null;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (w.__speechStarts as number)++;
        w.__speechLang = this.lang;
        const next = (w.__speechQueue as { alts?: string[]; error?: string }[]).shift() ?? { alts: [] };
        setTimeout(() => {
          this.onstart?.();
          setTimeout(() => {
            if (next.error) {
              this.onerror?.({ error: next.error });
            } else {
              const alts = (next.alts ?? []).map((t) => ({ transcript: t, confidence: 0.8 }));
              if (alts.length) this.onresult?.({ resultIndex: 0, results: { length: 1, 0: Object.assign(alts, { isFinal: true }) } });
            }
            this.onend?.();
          }, 100);
        }, 20);
      }
      stop() {}
      abort() {
        this.onend?.();
      }
    }
    w.webkitSpeechRecognition = FakeRecognition;
    w.SpeechRecognition = FakeRecognition;
  });
}

export async function queueSpeech(page: Page, item: { alts?: string[]; error?: string }) {
  await page.evaluate((it) => (window as unknown as { __speechQueue: unknown[] }).__speechQueue.push(it), item);
}

export async function removeRecognitionAndRecorder(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.webkitSpeechRecognition;
    delete w.SpeechRecognition;
    delete w.MediaRecorder;
  });
}

/** Seeds settings so tests skip onboarding. */
export async function seedSettings(page: Page, settings: Record<string, unknown> = {}) {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('bolo-urdu:v1')) {
      localStorage.setItem('bolo-urdu:v1', JSON.stringify({ version: 1, settings: { onboarded: true, soundEffects: false, ...s } }));
    }
  }, settings);
}

/**
 * Answers the current exercise correctly by reading its data from the React props
 * (test-only shortcut so we can drive a full lesson). Returns the exercise kind, or null at the end.
 */
export async function answerCurrentExercise(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const btns = () => [...document.querySelectorAll('button')] as HTMLButtonElement[];
    const click = (pred: (b: HTMLButtonElement) => boolean) => {
      const b = btns().find((x) => !x.disabled && pred(x));
      b?.click();
      return !!b;
    };
    const byText = (t: string) => click((b) => b.textContent!.trim() === t);
    const el = document.querySelector('.session-body > :not(.teacher):not(.test-head)');
    if (!el) return null;
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let f: any = (el as any)[key];
    while (f && !(f.memoizedProps?.ex && f.memoizedProps?.api)) f = f.return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex: any = f?.memoizedProps.ex;
    if (!ex) return null;
    const w = window as unknown as { __speechQueue: unknown[] };
    switch (ex.kind) {
      case 'mcq':
      case 'listen':
      case 'complete':
        (document.querySelectorAll('.session-body .options button.option')[ex.answer] as HTMLElement).click();
        await sleep(50);
        byText('Check');
        break;
      case 'fill':
        (document.querySelectorAll('.session-body .tile')[ex.answer] as HTMLElement).click();
        await sleep(50);
        byText('Check');
        break;
      case 'match':
        for (const p of ex.pairs) {
          click((b) => b.textContent!.trim() === p.en);
          await sleep(30);
          click((b) => b.textContent!.trim() === p.roman && b.classList.contains('roman'));
          await sleep(30);
        }
        break;
      case 'order':
        for (const word of ex.answer) {
          const t = [...document.querySelectorAll('.session-body .row.wrap .tile')].find(
            (b) => !(b as HTMLButtonElement).disabled && b.textContent!.trim() === word,
          ) as HTMLElement | undefined;
          t?.click();
          await sleep(30);
        }
        byText('Check');
        break;
      case 'translate': {
        const ta = document.querySelector('.session-body textarea') as HTMLTextAreaElement;
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, ex.accepted[0].replace('{name}', 'Sara'));
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(50);
        byText('Check');
        break;
      }
      case 'flashcard':
        byText('Flip card');
        await sleep(50);
        byText('I knew it');
        break;
      case 'repeat':
      case 'spokenQA': {
        const t = ex.kind === 'repeat' ? ex.phrase.urdu : ex.question.answers[0].urdu.replace('{name}', 'سارہ');
        w.__speechQueue?.push({ alts: [t] });
        (document.querySelector('.mic-btn') as HTMLElement)?.click();
        await sleep(400);
        break;
      }
      case 'say':
        byText("I've said it — show me the answer");
        await sleep(150);
        byText('I got it!');
        break;
      case 'dialogue':
        if (ex.mode === 'speak') {
          for (let i = 0; i < 20 && document.querySelector('.session-body .btn.primary.block'); i++) {
            byText('Next line');
            await sleep(900);
          }
          await sleep(1500);
          for (let i = 0; i < 10 && byText('Next line'); i++) await sleep(1500);
        }
        break;
      case 'readAloud':
        if (ex.passage.question) (document.querySelectorAll('.session-body .card.soft .options button')[ex.passage.question.answer] as HTMLElement).click();
        break;
    }
    await sleep(80);
    if (!byText('Continue')) byText('Skip speaking for now');
    return ex.kind as string;
  });
}
