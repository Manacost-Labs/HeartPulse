import '../../../../../src/route-parchment.css';
import { battlegroundBuilderMetadata, type BuilderSearch } from '../../../lib/battlegroundBuilderMetadata';
import { BattlegroundStrategiesPageClient } from '../../../ui/BattlegroundStrategiesPageClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: BuilderSearch }) {
  return battlegroundBuilderMetadata('/battlegrounds/strategies', searchParams);
}

export default function Page() {
  return <BattlegroundStrategiesPageClient />;
}
