'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  canAccessAdminWorkspace,
  canManageContests,
  fetchCurrentAuthUser,
  type AuthUser,
} from '@/src/modules/identity/public';

/** The console's frame without content: same columns and bar height, so nothing moves when it mounts. */
function AdminConsolePlaceholder({ label }: { label: string }) {
  return <div className="admin-console-placeholder" aria-busy="true">
    <div className="admin-console-placeholder__rail" aria-hidden="true" />
    <div className="admin-console-placeholder__body">
      <div className="admin-console-placeholder__bar" aria-hidden="true" />
      <main className="admin-console-placeholder__main" aria-live="polite">{label}</main>
    </div>
  </div>;
}

const ContestAdminPanel = dynamic(
  () => import('@/src/features/Contests').then(module => module.ContestAdminPanel),
  { ssr: false, loading: () => <AdminConsolePlaceholder label="Загрузка панели управления…" /> },
);

type AccessState = { status: 'checking' | 'denied' | 'unavailable' } | { status: 'allowed'; user: AuthUser };

export function AdminPageClient() {
  const [access, setAccess] = useState<AccessState>({ status: 'checking' });
  useEffect(() => {
    // The server already accepted this session for /admin/, so the console code downloads while the
    // browser re-checks access instead of after it. The chunk holds code only, never admin data.
    void import('@/src/features/Contests').catch(() => { /* the dynamic loader reports a failed chunk */ });
    const sectionPreload = import('@/src/features/adminConsole/sectionPreload');
    sectionPreload.catch(() => { /* the section loads on its own when the panel renders */ });
    const controller = new AbortController();
    void fetchCurrentAuthUser(controller.signal)
      .then(user => {
        if (controller.signal.aborted) return;
        const allowed = Boolean(user && canManageContests(user));
        setAccess(user && allowed ? { status: 'allowed', user } : { status: 'denied' });
        // The opening section's code and data start beside the panel code, not after the panel renders.
        if (allowed) {
          void sectionPreload.then(module => module.preloadAdminSection(window.location.search, canAccessAdminWorkspace(user)), () => {});
        }
      })
      .catch(() => { if (!controller.signal.aborted) setAccess({ status: 'unavailable' }); });
    return () => controller.abort();
  }, []);

  if (access.status === 'allowed') return <ContestAdminPanel authUser={access.user} />;
  if (access.status === 'checking') return <AdminConsolePlaceholder label="Проверка доступа…" />;
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
