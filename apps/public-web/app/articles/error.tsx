'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { usePublicAccess } from '@/apps/public-web/ui/usePublicAccess';
import { navigate } from '@/apps/public-web/ui/navigation';
import { useRouteErrorReport } from '@/apps/public-web/ui/useRouteErrorReport';

export default function ArticlesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const access = usePublicAccess();
  useRouteErrorReport(error, 'route:articles');
  return <PublicPageShell activeTab="articles" pathname="/articles/" access={access}
    navigate={navigate} editorial>
    <div role="alert" data-app-error="route:articles" className="articles-empty-modern text-center py-16">
      <h1 className="font-hs text-xl">Статьи временно недоступны</h1>
      <p>Попробуйте загрузить раздел ещё раз.</p>
      <button type="button" onClick={reset}>Повторить</button>
    </div>
  </PublicPageShell>;
}
