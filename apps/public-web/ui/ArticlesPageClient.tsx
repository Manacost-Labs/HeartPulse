'use client';

import { useEffect, useState } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { ArticlesTab, type ArticlesData } from '@/src/modules/articles/public';
import { articlesData } from '@/apps/public-web/lib/articlesData';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function ArticlesPageClient({ initialData }: { initialData: ArticlesData }) {
  const access = usePublicAccess();
  const [personal, setPersonal] = useState<{ owner: string; data: ArticlesData } | null>(null);
  const [personalError, setPersonalError] = useState(false);
  const [retry, setRetry] = useState(0);
  const userId = access.user?.id;
  // The build prerenders without the API (no articles, no date); until the
  // post-deploy regeneration replaces that copy, the browser reads them itself.
  const seedMissing = initialData.updatedAt === null && initialData.articles.length === 0;
  const [publicData, setPublicData] = useState<ArticlesData | null>(null);
  // Votes belong to the viewer who fetched them: anyone else, or nobody while
  // access is checked again (a restored page), sees the public data at once.
  const data = personal && userId && personal.owner === userId ? personal.data : publicData ?? initialData;

  useEffect(() => {
    if (!seedMissing) return;
    const controller = new AbortController();
    void fetch('/api/articles', {
      credentials: 'omit', signal: controller.signal, headers: { Accept: 'application/json' },
    }).then(async response => {
      if (!response.ok) throw new Error('Articles unavailable');
      return articlesData(await response.json());
    }).then(value => {
      if (!controller.signal.aborted) setPublicData(value);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [seedMissing]);

  useEffect(() => {
    if (access.checking) return;
    if (!userId) { setPersonal(null); setPersonalError(false); return; }
    const controller = new AbortController();
    void fetch('/api/articles', {
      cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
      headers: { Accept: 'application/json' },
    }).then(async response => {
      if (!response.ok) throw new Error('Article votes unavailable');
      return articlesData(await response.json(), true);
    }).then(value => {
      if (!controller.signal.aborted) { setPersonal({ owner: userId, data: value }); setPersonalError(false); }
    }).catch(() => {
      if (!controller.signal.aborted) setPersonalError(true);
    });
    return () => controller.abort();
  }, [access.checking, userId, retry]);

  return <PublicPageShell activeTab="articles" pathname="/articles/" access={access} navigate={navigate} editorial parchmentPreload="tablet-up">
    {personalError && <div role="status" className="articles-personal-error mb-4 rounded-lg border p-3">
      Не удалось обновить ваши голоса. Показаны общедоступные данные.
      <button type="button" className="articles-personal-retry underline" onClick={() => setRetry(value => value + 1)}>Повторить</button>
    </div>}
    <ArticlesTab data={data} loading={false} onNavigate={tab => navigate(tab === 'home' ? '/' : `/${tab}/`)}
      authUser={access.user} subscriptionStatus={access.subscription} subscriptionLoading={access.checking} />
  </PublicPageShell>;
}
