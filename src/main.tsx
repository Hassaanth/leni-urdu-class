import '@fontsource-variable/nunito/wght.css';
import '@fontsource/noto-nastaliq-urdu/arabic-400.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: production builds only (dev uses Vite's live reload).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // When a new version is published, the new service worker takes over; reload once so the
    // learner gets the new lessons instead of the cached old app.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) {
        reloaded = true;
        window.location.reload();
      }
    });
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => reg.update())
      .catch((e) => console.warn('Service worker registration failed', e));
  });
}
