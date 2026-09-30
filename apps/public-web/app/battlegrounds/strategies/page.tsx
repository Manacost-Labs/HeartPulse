import '@/src/route-parchment.css';
import { battlegroundBuilderMetadata, type BuilderSearch } from '@/apps/public-web/lib/battlegroundBuilderMetadata';
import { BattlegroundStrategiesPageClient } from '@/apps/public-web/ui/BattlegroundStrategiesPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: BuilderSearch }) {
  return battlegroundBuilderMetadata('/battlegrounds/strategies', searchParams);
}

export default function Page() {
  return <>
    <SeoStructuredData path="/battlegrounds/strategies" />
    <BattlegroundStrategiesPageClient />
  </>;
}
