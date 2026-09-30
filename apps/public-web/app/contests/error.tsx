'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { usePublicAccess } from '@/apps/public-web/ui/usePublicAccess';
import { navigate } from '@/apps/public-web/ui/navigation';
import { useRouteErrorReport } from '@/apps/public-web/ui/useRouteErrorReport';

export default function ContestsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const access = usePublicAccess();
  useRouteErrorReport(error, 'route:contests');
  return <PublicPageShell activeTab="contests" pathname="/contests/" access={access}
    navigate={navigate} editorial>
    <div role="alert" data-app-error="route:contests" className="contest-empty">
      <h1>Конкурсы временно недоступны</h1>
      <p>Попробуйте загрузить раздел ещё раз.</p>
      <button type="button" onClick={reset}>Повторить</button>
    </div>
  </PublicPageShell>;
}
