import '@/src/index.css';
import '@/src/parchment-theme.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { CANONICAL_HOST } from '@/src/config/domain';
import { FieldFocusMode } from '@/apps/public-web/ui/FieldFocusMode';
import { WebVitalsReporter } from '@/apps/public-web/ui/WebVitalsReporter';
import { loadRuntimeClientConfig } from '@/apps/public-web/lib/runtimeClientConfig';

// Pages replace title, description, canonical and robots; everything else
// here reaches every document, so an unregistered page stays noindex.
export const metadata: Metadata = {
  metadataBase: new URL('https://hearthpulse.net'),
  title: 'HearthPulse',
  authors: [{ name: 'Manacost' }],
  robots: { index: false, follow: false },
  // Search Console ownership. Yandex verifies through a static file in `public/`.
  verification: { google: 'aGEyRvNTeG7FHSUUER0Tsfyyyd3sdRywc4qLycYIcpo' },
  icons: {
    icon: [
      { url: '/favicon-16.png?v=hearthstone-cute-20260727', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png?v=hearthstone-cute-20260727', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-96.png?v=hearthstone-cute-20260727', type: 'image/png', sizes: '96x96' },
      { url: '/favicon.ico?v=hearthstone-cute-20260727', type: 'image/x-icon' },
    ],
    apple: { url: '/apple-touch-icon.png?v=hearthstone-cute-20260727', type: 'image/png', sizes: '180x180' },
  },
};

export const viewport: Viewport = { themeColor: '#081a33', colorScheme: 'light' };

// Plausible counts one pageview per document, and pages navigate with full
// loads. Only the canonical host loads it: tests, local runs and staging stay
// out of the statistics, and an analytics outage cannot delay them.
const ANALYTICS_LOADER = `if(location.hostname===${JSON.stringify(CANONICAL_HOST)}){`
  + 'var s=document.createElement("script");'
  + `s.dataset.domain=${JSON.stringify(CANONICAL_HOST)};`
  + 's.src="https://stats.hs-manacost.ru/js/script.js";document.head.appendChild(s)}';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const runtimeConfig = JSON.stringify(await loadRuntimeClientConfig()).replace(/</g, '\\u003c');
  // PageTour and ModalSurface make `#root` inert and aria-hidden while their
  // portaled dialogs are open; without it the page behind them stays reachable.
  return <html lang="ru"><body>
    {/* Inline and first: the switches must exist before any chunk hydrates. */}
    <script dangerouslySetInnerHTML={{ __html: `window.__ARENA_RUNTIME_CONFIG__=${runtimeConfig}` }} />
    <div id="root">{children}</div>
    <FieldFocusMode />
    <WebVitalsReporter />
    <script dangerouslySetInnerHTML={{ __html: ANALYTICS_LOADER }} />
  </body></html>;
}
