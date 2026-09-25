'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  canManageContests,
  fetchCurrentAuthUser,
  type AuthUser,
} from '../../../src/modules/identity/public';

const ContestAdminPanel = dynamic(
  () => import('../../../src/features/Contests').then(module => module.ContestAdminPanel),
  { ssr: false, loading: () => <div className="admin-access-page" aria-live="polite">Загрузка панели управления…</div> },
);

type AccessState = { status: 'checking' | 'denied' | 'unavailable' } | { status: 'allowed'; user: AuthUser };

export function AdminPageClient() {
  const [access, setAccess] = useState<AccessState>({ status: 'checking' });
  useEffect(() => {
    const controller = new AbortController();
    void fetchCurrentAuthUser(controller.signal)
      .then(user => {
        if (!controller.signal.aborted) setAccess(user && canManageContests(user)
          ? { status: 'allowed', user } : { status: 'denied' });
      })
      .catch(() => { if (!controller.signal.aborted) setAccess({ status: 'unavailable' }); });
    return () => controller.abort();
  }, []);

  if (access.status === 'allowed') return <main><ContestAdminPanel authUser={access.user} /></main>;
  if (access.status === 'checking') {
    return <main className="admin-access-page" aria-live="polite">Проверка доступа…</main>;
  }
  return <main className="admin-access-page"><section className="admin-access-card" aria-labelledby="admin-access-title">
    <h1 id="admin-access-title">{access.status === 'denied' ? 'Админ панель недоступна' : 'Не удалось проверить доступ'}</h1>
    <p>{access.status === 'denied'
      ? 'Войдите в аккаунт администратора или запросите необходимые права.'
      : 'Проверьте подключение и повторите попытку.'}</p>
    {access.status === 'denied'
      ? <a href="/?login">Войти в профиль</a>
      : <button type="button" onClick={() => window.location.reload()}>Повторить</button>}
  </section></main>;
}
