import '@/src/index.css';
import '@/src/parchment-theme.css';
import './page-transitions.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ANALYTICS_LOADER } from '@/apps/public-web/lib/analyticsLoader';
import { PAGE_ENTRANCE } from '@/apps/public-web/lib/pageEntrance';
import { SPECULATION_RULES } from '@/apps/public-web/lib/speculationRules';
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const runtimeConfig = JSON.stringify(await loadRuntimeClientConfig()).replace(/</g, '\\u003c');
  // PageTour and ModalSurface make `#root` inert and aria-hidden while their
  // portaled dialogs are open; without it the page behind them stays reachable.
  // A page is revealed only once its content box has opened: a cross-document
  // transition then always has the new content to fade in, not just the header.
  // The entrance script marks `<html>` before React hydrates it, hence the
  // suppressed attribute warning on that element only.
  return <html lang="ru" suppressHydrationWarning><head>
    <link rel="expect" href="#route-content-start" blocking="render" />
    <script dangerouslySetInnerHTML={{ __html: PAGE_ENTRANCE }} />
  </head><body>
    {/* Inline and first: the switches must exist before any chunk hydrates. */}
    <script dangerouslySetInnerHTML={{ __html: `window.__ARENA_RUNTIME_CONFIG__=${runtimeConfig}` }} />
    <div id="root">{children}</div>
    <FieldFocusMode />
    <WebVitalsReporter />
    <script dangerouslySetInnerHTML={{ __html: ANALYTICS_LOADER }} />
    <script type="speculationrules" dangerouslySetInnerHTML={{ __html: JSON.stringify(SPECULATION_RULES) }} />
  </body></html>;
}
