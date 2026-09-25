'use client';

import dynamic from 'next/dynamic';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { usePublicAccess } from './usePublicAccess';

const DeckBuilder = dynamic(() => import('../../../src/features/DeckBuilder'), { ssr: false });
const navigate = (path: string) => { window.location.assign(path); };

export function DeckBuilderPageClient({ serverAllowed }: { serverAllowed: boolean }) {
  const access = usePublicAccess();
  const allowed = serverAllowed && !access.checking && access.admin;
  return <PublicPageShell activeTab="constructed-archetypes" pathname="/deck-builder/"
    access={access} navigate={navigate} wide>
    {allowed ? <DeckBuilder isAdmin /> : <section className="deck-builder-access-card"
      aria-labelledby="deck-builder-access-title" aria-live={access.checking ? 'polite' : undefined}>
      <h1 id="deck-builder-access-title">{serverAllowed && access.checking
        ? 'Проверка доступа…' : 'Конструктор колоды недоступен'}</h1>
      {serverAllowed && access.checking
        ? <p>Проверяем права администратора.</p>
        : <><p>Раздел доступен только администраторам.</p><a href="/?login">Войти в профиль</a></>}
    </section>}
  </PublicPageShell>;
}
