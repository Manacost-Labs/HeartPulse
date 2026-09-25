'use client';

import dynamic from 'next/dynamic';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { usePublicAccess } from './usePublicAccess';

const StandardArchetypes = dynamic(() => import('../../../src/features/Archetypes'), { ssr: false });
const WildArchetypes = dynamic(() => import('../../../src/modules/adminWorkspace/public').then(module => module.WildArchetypesPage), { ssr: false });
const navigate = (path: string) => { window.location.assign(path); };
async function requestAdminJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error(response.status === 403
    ? 'Доступ закрыт' : 'Не удалось загрузить данные');
  return response.json();
}
const loadWildCatalog = (signal: AbortSignal) =>
  requestAdminJson('/api/admin/archetypes?format=wild', signal);
const loadWildDecks = (archetype: string, signal: AbortSignal) =>
  requestAdminJson(`/api/admin/archetypes/wild/decks?archetype=${encodeURIComponent(archetype)}`, signal);

export function AdminArchetypesPageClient({ serverAllowed, currentPath }: {
  serverAllowed: boolean;
  currentPath: string;
}) {
  const access = usePublicAccess();
  const allowed = serverAllowed && !access.checking && access.admin;
  return <PublicPageShell activeTab="constructed-archetypes" pathname={currentPath}
    access={access} navigate={navigate} wide>
    {allowed
      ? currentPath === '/archetypes/wild/'
        ? <WildArchetypes loadCatalog={loadWildCatalog} loadDecks={loadWildDecks} />
        : <StandardArchetypes isAdmin currentPath={currentPath} />
      : <section className="archetypes-access-card" aria-labelledby="archetypes-access-title"
        aria-live={access.checking ? 'polite' : undefined}>
        <h1 id="archetypes-access-title">{serverAllowed && access.checking
          ? 'Проверка доступа…' : 'Архетипы недоступны'}</h1>
        {serverAllowed && access.checking
          ? <p>Проверяем права администратора.</p>
          : <><p>Раздел доступен только администраторам.</p><a href="/?login">Войти в профиль</a></>}
      </section>}
  </PublicPageShell>;
}
