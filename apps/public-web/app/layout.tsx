import '@/src/index.css';
import '@/src/parchment-theme.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ANALYTICS_LOADER } from '@/apps/public-web/lib/analyticsLoader';
import { AUTH_PREFETCH } from '@/apps/public-web/lib/authPrefetch';
import { PublicNavigationLayout } from '@/apps/public-web/ui/PublicNavigationLayout';
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
  // Wait only for the content box, rather than the entire streamed document.
  return <html lang="ru"><head>
    <link rel="expect" href="#route-content-start" blocking="render" />
    <script dangerouslySetInnerHTML={{ __html: AUTH_PREFETCH }} />
  </head><body>
    {/* Inline and first: the switches must exist before any chunk hydrates. */}
    <script dangerouslySetInnerHTML={{ __html: `window.__ARENA_RUNTIME_CONFIG__=${runtimeConfig}` }} />
    <div id="root"><PublicNavigationLayout>{children}</PublicNavigationLayout></div>
    <FieldFocusMode />
    <WebVitalsReporter />
    <script dangerouslySetInnerHTML={{ __html: ANALYTICS_LOADER }} />
  </body></html>;
}
