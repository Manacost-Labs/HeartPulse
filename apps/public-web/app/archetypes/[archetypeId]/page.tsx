import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { canOpenAdminPage } from '../../../lib/adminAccess';
import { AdminArchetypesPageClient } from '../../../ui/AdminArchetypesPageClient';
import '../route.css';

type Props = { params: Promise<{ archetypeId: string }> };
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Карточка архетипа — HearthPulse', robots: { index: false, follow: false } };

export default async function Page({ params }: Props) {
  const { archetypeId } = await params;
  if (!/^[1-9][0-9]*$/.test(archetypeId) || !Number.isSafeInteger(Number(archetypeId))) notFound();
  return <AdminArchetypesPageClient serverAllowed={await canOpenAdminPage('workspace')}
    currentPath={`/archetypes/${archetypeId}/`} />;
}
