import '@/src/index.css';
import '@/src/parchment-theme.css';
import '@/src/app/shell/PublicNavigation.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { RUNTIME_CONFIG_ELEMENT_ID } from '@/apps/public-web/lib/inlineScripts';
import { InlineScript } from '@/apps/public-web/ui/InlineScript';
import { PublicNavigationLayout } from '@/apps/public-web/ui/PublicNavigationLayout';
import { FieldFocusMode } from '@/apps/public-web/ui/FieldFocusMode';
import { WebVitalsReporter } from '@/apps/public-web/ui/WebVitalsReporter';
import { loadRuntimeClientConfig } from '@/apps/public-web/lib/runtimeClientConfig';
import searchVerification from '@/config/search-verification.json';

// Pages replace title, description, canonical and robots; everything else
// here reaches every document, so an unregistered page stays noindex.
export const metadata: Metadata = {
  metadataBase: new URL('https://hearthpulse.net'),
  title: 'HearthPulse',
  authors: [{ name: 'Manacost' }],
  robots: { index: false, follow: false },
  // Search Console and Yandex Webmaster ownership codes; an empty list prints no tag.
  // Add codes in config/search-verification.json (docs/runbooks/search-consoles.md).
  verification: searchVerification,
  icons: {
    icon: [
      { url: '/favicon-16.png?v=hearthstone-cute-20261020', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png?v=hearthstone-cute-20261020', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-96.png?v=hearthstone-cute-20261020', type: 'image/png', sizes: '96x96' },
      { url: '/favicon.ico?v=hearthstone-cute-20261020', type: 'image/x-icon' },
    ],
    apple: { url: '/apple-touch-icon.png?v=hearthstone-cute-20261020', type: 'image/png', sizes: '180x180' },
  },
};

// The phone's status bar and toolbar take this colour: `--arena-rail-red`
// (src/styles/tokens.css), the tone of the red rail that `.arena-mobile-topbar`
// paints, so the browser chrome and the top bar read as one band. A `<meta>`
// cannot read tokens; `tests/page-headers-browser.test.mjs` keeps them in step.
export const viewport: Viewport = { themeColor: '#741a1a', colorScheme: 'light' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const runtimeConfig = JSON.stringify(await loadRuntimeClientConfig()).replace(/</g, '\\u003c');
  // PageTour and ModalSurface make `#root` inert and aria-hidden while their
  // portaled dialogs are open; without it the page behind them stays reachable.
  // Wait only for the content box, rather than the entire streamed document.
  // The head scripts may mark <html> before hydration: data-hp-viewer
  // (lib/authPrefetch.ts) and the remembered compact menu (data-nav-compact);
  // those attributes are the only expected difference.
  return <html lang="ru" suppressHydrationWarning><head>
    <link rel="expect" href="#route-content-start" blocking="render" />
    {/* The header and every section frame draw these from CSS, which finds
        them only after it has loaded; on a slow phone network the frames
        then appear a second or two after the page. */}
    <link rel="preload" as="image" href="/wallpaper/arena-rail-red.jpg" />
    <link rel="preload" as="image" href="/wallpaper/main-page-rail-border.png" />
    <InlineScript id="navigation" />
    <InlineScript id="authPrefetch" />
  </head><body>
    {/* Inline and first: the switches must exist before any chunk hydrates. They
        are data, so the script that publishes them keeps one CSP hash. */}
    <script type="application/json" id={RUNTIME_CONFIG_ELEMENT_ID} dangerouslySetInnerHTML={{ __html: runtimeConfig }} />
    <InlineScript id="runtimeConfig" />
    <div id="root"><PublicNavigationLayout>{children}</PublicNavigationLayout></div>
    <FieldFocusMode />
    <WebVitalsReporter />
    <InlineScript id="analytics" />
  </body></html>;
}
