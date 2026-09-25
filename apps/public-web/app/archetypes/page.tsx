import type { Metadata } from 'next';
import { canOpenAdminPage } from '../../lib/adminAccess';
import { AdminArchetypesPageClient } from '../../ui/AdminArchetypesPageClient';
import './route.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Архетипы — HearthPulse', robots: { index: false, follow: false } };

export default async function Page() {
  return <AdminArchetypesPageClient serverAllowed={await canOpenAdminPage('workspace')} currentPath="/archetypes/" />;
}
