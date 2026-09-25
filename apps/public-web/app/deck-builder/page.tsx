import type { Metadata } from 'next';
import { canOpenAdminPage } from '../../lib/adminAccess';
import { DeckBuilderPageClient } from '../../ui/DeckBuilderPageClient';
import './deck-builder-route.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Конструктор колод — HearthPulse',
  robots: { index: false, follow: false },
};

export default async function Page() {
  return <DeckBuilderPageClient serverAllowed={await canOpenAdminPage('workspace')} />;
}
