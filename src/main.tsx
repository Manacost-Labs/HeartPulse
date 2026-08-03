import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AppErrorBoundary from './components/AppErrorBoundary';
import './index.css';
import './parchment-theme.css';

const releaseId = typeof __APP_RELEASE_SHA__ === 'string' ? __APP_RELEASE_SHA__ : 'development';

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
      console.warn('[telemetry] web-vitals failed:', error);
    });
};

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(startClientRum, { timeout: 1_500 });
} else {
  setTimeout(startClientRum, 0);
}
