'use client';

import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { usePublicAccess } from '@/apps/public-web/ui/usePublicAccess';
import { navigate } from '@/apps/public-web/ui/navigation';
import { useRouteErrorRecovery } from '@/apps/public-web/ui/useRouteErrorRecovery';

export default function ContestsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const access = usePublicAccess();
  const recovery = useRouteErrorRecovery(error, retry, 'route:contests', {
    heading: 'Конкурсы временно недоступны',
    text: 'Попробуйте загрузить раздел ещё раз.',
  });
  return <PublicPageShell activeTab="contests" pathname="/contests/" access={access}
    navigate={navigate} editorial>
    <div role="alert" data-app-error="route:contests" className="contest-empty">
      <SectionBanner title={recovery.heading} />
      <p>{recovery.text}</p>
      <button type="button" onClick={recovery.retry}>{recovery.action}</button>
    </div>
  </PublicPageShell>;
}
