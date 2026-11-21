'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import FunDecksPage from '@/src/features/FunDecksPage';
import type { FunDecksPayload } from '@/src/features/funDecksPreview';
import type { FunDecksFilters } from '@/src/features/useFunDecksFilters';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** `initialPreview`: the selection the server read, rendered as the page's own tiles for every viewer, filtered as the address asks. */
export function FunDecksPageClient({ initialPreview, initialFilters }: { initialPreview: FunDecksPayload | null; initialFilters: FunDecksFilters }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="fun-decks" pathname="/standard/fun-decks/"
    access={access} navigate={navigate} wide>
    <FunDecksPage initialPreview={initialPreview} initialFilters={initialFilters} />
  </PublicPageShell>;
}
