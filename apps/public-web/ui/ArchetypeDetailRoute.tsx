import '../../../src/route-parchment.css';
import '../../../src/features/TraditionalModeBanner.css';
import { resolveArchetypeRoute, type ArchetypeFamily, type ArchetypeRouteParams } from '../lib/publicArchetypeRoute';
import { ArchetypeDetailPageClient } from './ArchetypeDetailPageClient';

export async function ArchetypeDetailRoute({ params, family }: { params: ArchetypeRouteParams; family: ArchetypeFamily }) {
  const { format, slug, detail } = await resolveArchetypeRoute(params);
  return <ArchetypeDetailPageClient pathname={`/standard/${family}/${format}/${slug}/`} detail={detail} />;
}
