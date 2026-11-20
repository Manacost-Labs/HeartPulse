import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { loadArchetypeFormatCatalog, resolveArchetypeRoute, type ArchetypeFamily, type ArchetypeRouteParams } from '@/apps/public-web/lib/publicArchetypeRoute';
import { ArchetypeOpenBuilds } from './ArchetypeOpenBuilds';
import { ArchetypeDetailPageClient } from './ArchetypeDetailPageClient';
import { ArchetypeSeoSummary } from './ArchetypeSeoSummary';
import { ArchetypeStructuredData } from './ArchetypeStructuredData';

export async function ArchetypeDetailRoute({ params, family }: { params: ArchetypeRouteParams; family: ArchetypeFamily }) {
  const { format, slug, detail } = await resolveArchetypeRoute(params);
  const catalog = await loadArchetypeFormatCatalog(format, detail);
  // The build list is rendered once, by `ArchetypeOpenBuilds`; the client copy of the detail does not repeat it in the RSC payload.
  const clientDetail = { ...detail, item: { ...detail.item, builds: [] } };
  return <>
    <ArchetypeStructuredData detail={detail} catalog={catalog} family={family} />
    <ArchetypeDetailPageClient pathname={`/standard/${family}/${format}/${slug}/`} detail={clientDetail} openBuilds={<ArchetypeOpenBuilds detail={detail} />}>
      <ArchetypeSeoSummary detail={detail} catalog={catalog} />
    </ArchetypeDetailPageClient>
  </>;
}
