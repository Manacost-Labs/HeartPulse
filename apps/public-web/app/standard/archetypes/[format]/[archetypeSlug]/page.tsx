import { archetypeDetailMetadata, type ArchetypeRouteParams } from '@/apps/public-web/lib/publicArchetypeRoute';
import { ArchetypeDetailRoute } from '@/apps/public-web/ui/ArchetypeDetailRoute';

type Props = { params: ArchetypeRouteParams };
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props) {
  return archetypeDetailMetadata(params, 'archetypes');
}

export default function Page({ params }: Props) {
  return <ArchetypeDetailRoute params={params} family="archetypes" />;
}
