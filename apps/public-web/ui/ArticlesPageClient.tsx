'use client';

import { useEffect, useState } from 'react';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { ArticlesTab, type ArticlesData } from '../../../src/modules/articles/public';
import { articlesData } from '../lib/articlesData';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => { window.location.assign(path); };

export function ArticlesPageClient({ initialData }: { initialData: ArticlesData }) {
  const access = usePublicAccess();
  const [data, setData] = useState(initialData);
  const [personalError, setPersonalError] = useState(false);
  const [retry, setRetry] = useState(0);
  const userId = access.user?.id;

  useEffect(() => {
    if (access.checking) return;
    if (!userId) { setData(initialData); setPersonalError(false); return; }
    const controller = new AbortController();
    void fetch('/api/articles', {
      cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
      headers: { Accept: 'application/json' },
    }).then(async response => {
      if (!response.ok) throw new Error('Article votes unavailable');
      return articlesData(await response.json(), true);
    }).then(value => {
      if (!controller.signal.aborted) { setData(value); setPersonalError(false); }
    }).catch(() => {
      if (!controller.signal.aborted) setPersonalError(true);
    });
    return () => controller.abort();
  }, [access.checking, userId, initialData, retry]);

  return <PublicPageShell activeTab="articles" pathname="/articles/" access={access} navigate={navigate} editorial>
    {personalError && <div role="status" className="articles-personal-error mb-4 rounded-lg border p-3">
      Не удалось обновить ваши голоса. Показаны общедоступные данные.
      <button type="button" className="articles-personal-retry underline" onClick={() => setRetry(value => value + 1)}>Повторить</button>
    </div>}
    <ArticlesTab data={data} loading={false} onNavigate={tab => navigate(tab === 'home' ? '/' : `/${tab}/`)}
      authUser={access.user} subscriptionStatus={access.subscription} subscriptionLoading={access.checking} />
  </PublicPageShell>;
}
