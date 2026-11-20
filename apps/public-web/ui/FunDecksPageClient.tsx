'use client';

import type { ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import FunDecksPage from '@/src/features/FunDecksPage';
import type { FunDecksPayload } from '@/src/features/funDecksPreview';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** `openDecks` is the server-rendered list of every deck with its cards and code. */
export function FunDecksPageClient({ initialPreview, openDecks }: { initialPreview: FunDecksPayload | null; openDecks?: ReactNode }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="fun-decks" pathname="/standard/fun-decks/"
    access={access} navigate={navigate} wide>
    <FunDecksPage initialPreview={initialPreview} openDecks={openDecks} />
  </PublicPageShell>;
}
