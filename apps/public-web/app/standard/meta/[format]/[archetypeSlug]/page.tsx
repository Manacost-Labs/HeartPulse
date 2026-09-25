import { archetypeDetailMetadata, type ArchetypeRouteParams } from '../../../../../lib/publicArchetypeRoute';
import { ArchetypeDetailRoute } from '../../../../../ui/ArchetypeDetailRoute';

type Props = { params: ArchetypeRouteParams };
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props) {
  return archetypeDetailMetadata(params, 'meta');
}

export default function Page({ params }: Props) {
  return <ArchetypeDetailRoute params={params} family="meta" />;
}
