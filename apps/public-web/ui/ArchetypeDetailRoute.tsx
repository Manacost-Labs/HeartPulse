import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { loadArchetypeFormatCatalog, resolveArchetypeRoute, type ArchetypeFamily, type ArchetypeRouteParams } from '@/apps/public-web/lib/publicArchetypeRoute';
import { ArchetypeDetailPageClient } from './ArchetypeDetailPageClient';
import { ArchetypeSeoSummary } from './ArchetypeSeoSummary';
import { ArchetypeStructuredData } from './ArchetypeStructuredData';

export async function ArchetypeDetailRoute({ params, family }: { params: ArchetypeRouteParams; family: ArchetypeFamily }) {
  const { format, slug, detail } = await resolveArchetypeRoute(params);
  const catalog = await loadArchetypeFormatCatalog(format);
  return <>
    <ArchetypeStructuredData detail={detail} catalog={catalog} family={family} />
    <ArchetypeDetailPageClient pathname={`/standard/${family}/${format}/${slug}/`} detail={detail}>
      <ArchetypeSeoSummary detail={detail} catalog={catalog} />
    </ArchetypeDetailPageClient>
  </>;
}
