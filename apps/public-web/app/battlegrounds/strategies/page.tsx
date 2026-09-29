import '@/src/route-parchment.css';
import { battlegroundBuilderMetadata, type BuilderSearch } from '@/apps/public-web/lib/battlegroundBuilderMetadata';
import { BattlegroundStrategiesPageClient } from '@/apps/public-web/ui/BattlegroundStrategiesPageClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: BuilderSearch }) {
  return battlegroundBuilderMetadata('/battlegrounds/strategies', searchParams);
}

export default function Page() {
  return <BattlegroundStrategiesPageClient />;
}
