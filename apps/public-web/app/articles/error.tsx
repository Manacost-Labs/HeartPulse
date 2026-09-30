'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { usePublicAccess } from '@/apps/public-web/ui/usePublicAccess';
import { navigate } from '@/apps/public-web/ui/navigation';
import { useRouteErrorRecovery } from '@/apps/public-web/ui/useRouteErrorRecovery';

export default function ArticlesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const access = usePublicAccess();
  const recovery = useRouteErrorRecovery(error, retry, 'route:articles', {
    heading: 'Статьи временно недоступны',
    text: 'Попробуйте загрузить раздел ещё раз.',
  });
  return <PublicPageShell activeTab="articles" pathname="/articles/" access={access}
    navigate={navigate} editorial>
    <div role="alert" data-app-error="route:articles" className="articles-empty-modern text-center py-16">
      <h1 className="font-hs text-xl">{recovery.heading}</h1>
      <p>{recovery.text}</p>
      <button type="button" onClick={recovery.retry}>{recovery.action}</button>
    </div>
  </PublicPageShell>;
}
