import '../../../../../src/route-parchment.css';
import { battlegroundBuilderMetadata, type BuilderSearch } from '../../../lib/battlegroundBuilderMetadata';
import { BattlegroundTierBuilderPageClient } from '../../../ui/BattlegroundTierBuilderPageClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: BuilderSearch }) {
  return battlegroundBuilderMetadata('/battlegrounds/tier-builder', searchParams);
}

export default function Page() {
  return <BattlegroundTierBuilderPageClient />;
}
