'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';
import { AssembleTool, type CardAssembleData, type CardAssembleListData } from '@/src/modules/constructedCards/public';
import './AssemblePage.css';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** «Сборка»: the tool page. The server seeds what it read in time; the browser loads the rest. */
export function AssemblePageClient({ format, card, initialList, initialCard }: {
  format: CardAssembleData['format'];
  card: string | null;
  initialList: CardAssembleListData | null;
  initialCard: CardAssembleData | null;
}) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="standard-assemble" pathname="/standard/assemble/" access={access} navigate={navigate} wide>
    <section className="space-y-5">
      <SectionBanner title="Сборка"
        subtitle="Карты со «Собирает»: какие существа выпадают основой, какие сборки с донором выигрывают чаще и какой из двух предложенных вариантов выбрать." />
      <AssembleTool format={format} requestedCard={card} initialList={initialList} initialCard={initialCard} onNavigate={navigate} />
    </section>
  </PublicPageShell>;
}
