import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { loadArchetypeFormatCatalog, resolveArchetypeRoute, type ArchetypeFamily, type ArchetypeRouteParams } from '@/apps/public-web/lib/publicArchetypeRoute';
import { ArchetypeDetailPageClient } from './ArchetypeDetailPageClient';
import { ArchetypeOpenBuilds } from './ArchetypeOpenBuilds';
import { ArchetypeSeoSummary } from './ArchetypeSeoSummary';
import { ArchetypeStructuredData } from './ArchetypeStructuredData';

export async function ArchetypeDetailRoute({ params, family }: { params: ArchetypeRouteParams; family: ArchetypeFamily }) {
  const { format, slug, detail } = await resolveArchetypeRoute(params);
  const catalog = await loadArchetypeFormatCatalog(format, detail);
  // The open builds render once, on the server: the client copy of the detail does not repeat them in the RSC payload.
  const { openBuilds, ...clientDetail } = detail;
  return <>
    <ArchetypeStructuredData detail={detail} catalog={catalog} family={family} />
    <ArchetypeDetailPageClient pathname={`/standard/${family}/${format}/${slug}/`} detail={clientDetail}
      openBuilds={openBuilds.length ? <ArchetypeOpenBuilds item={detail.item} builds={openBuilds} /> : undefined}>
      <ArchetypeSeoSummary detail={detail} catalog={catalog} />
    </ArchetypeDetailPageClient>
  </>;
}
