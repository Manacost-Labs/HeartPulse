import '@/src/index.css';
import '@/src/parchment-theme.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
export const metadata: Metadata = { metadataBase: new URL('https://hearthpulse.net'), title: 'HearthPulse', icons: { icon: '/favicon-32.png?v=hearthstone-cute-20260727' }, robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: ReactNode }) {
  // PageTour and ModalSurface make `#root` inert and aria-hidden while their
  // portaled dialogs are open; without it the page behind them stays reachable.
  return <html lang="ru"><body><div id="root">{children}</div></body></html>;
}
