import '@/src/route-parchment.css';
import { battlegroundBuilderMetadata, type BuilderSearch } from '@/apps/public-web/lib/battlegroundBuilderMetadata';
import { BattlegroundTierBuilderPageClient } from '@/apps/public-web/ui/BattlegroundTierBuilderPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: BuilderSearch }) {
  return battlegroundBuilderMetadata('/battlegrounds/tier-builder', searchParams);
}

export default function Page() {
  return <>
    <SeoStructuredData path="/battlegrounds/tier-builder" />
    <BattlegroundTierBuilderPageClient />
  </>;
}
