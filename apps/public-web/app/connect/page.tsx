import type { Metadata } from 'next';
import '../../../../src/route-parchment.css';
import { ApplicationConnectPageClient } from '../../ui/ApplicationConnectPageClient';

export const metadata: Metadata = {
  title: 'Подключение приложения — Manacost',
  description: 'Подтвердите подключение Manacost Tracker к своему аккаунту.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ApplicationConnectPageClient />;
}
