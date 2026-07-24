import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AppErrorBoundary from './components/AppErrorBoundary';
import { releaseIdFromModuleUrl } from './components/appErrorRecovery';
import './index.css';
import './parchment-theme.css';

const releaseId = releaseIdFromModuleUrl(import.meta.url);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary releaseId={releaseId}>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

const startClientRum = () => {
  void import('./telemetry/webVitals')
    .then(({ startWebVitalsReporting }) => startWebVitalsReporting())
    .catch(error => {
      console.warn(
        '[telemetry] web-vitals initialization failed:',
        error instanceof Error ? error.message : error,
      );
    });
};

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(startClientRum, { timeout: 1_500 });
} else {
  globalThis.setTimeout(startClientRum, 0);
}
