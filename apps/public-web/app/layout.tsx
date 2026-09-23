import '../../../src/index.css';
import '../../../src/parchment-theme.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
export const metadata: Metadata = { metadataBase: new URL('https://hearthpulse.net'), title: 'HearthPulse', icons: { icon: '/favicon-32.png?v=hearthstone-cute-20260727' }, robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ru"><body>{children}</body></html>;
}
