'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { DeckBuilderWorkbench, type DeckBuilderPorts } from '@/src/modules/deckBuilder/public';
import { encodeConstructedDeck } from '@/src/features/constructedDeckCode';
import { deckSizeLimit } from '@/src/features/deckBuilderRules';
import { requestDeckRender } from '@/src/features/deckrender/deckRenderClient';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

const ports: DeckBuilderPorts = {
  encode: (heroClass, format, cards) => encodeConstructedDeck({ heroClass, format, cards }),
  limit: deckSizeLimit,
  render: requestDeckRender,
};

export function PublicDeckBuilderPageClient() {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="deck-builder" pathname="/standard/deck-builder/" access={access} navigate={navigate} wide>
    <DeckBuilderWorkbench ports={ports} />
  </PublicPageShell>;
}
