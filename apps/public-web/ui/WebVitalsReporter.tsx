'use client';
import { useEffect } from 'react';

/**
 * Starts first-party Web Vitals reporting once the page is idle, when the
 * runtime switches allow it. The reporter and the `web-vitals` library load on
 * demand, so they stay out of every route's initial bundle.
 */
export function WebVitalsReporter() {
  useEffect(() => {
    if (window.__ARENA_RUNTIME_CONFIG__?.webVitals?.enabled !== true) return;
    const start = () => {
      void import('@/src/telemetry/webVitals')
        .then(({ startWebVitalsReporting }) => startWebVitalsReporting(process.env.NEXT_PUBLIC_WEB_VITALS_SAMPLE_RATE))
        .catch(error => console.warn('[telemetry] web-vitals failed:', error));
    };
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(start, { timeout: 1_500 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(start, 0);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
