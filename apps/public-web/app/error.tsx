'use client';
import { usePathname } from 'next/navigation';
import { Home, RefreshCw } from 'lucide-react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { tabFromPath } from '@/src/app/routing/navigationRoutes';
import { usePublicAccess } from '@/apps/public-web/ui/usePublicAccess';
import { navigate } from '@/apps/public-web/ui/navigation';
import { useRouteErrorRecovery } from '@/apps/public-web/ui/useRouteErrorRecovery';
import '@/src/features/NotFoundPage.css';

// Every route without its own error.tsx lands here, so the copy names no section.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const pathname = usePathname() || '/';
  const access = usePublicAccess();
  const recovery = useRouteErrorRecovery(error, retry, 'route', {
    heading: 'Страница временно недоступна',
    text: 'Не удалось загрузить данные. Попробуйте ещё раз через минуту — остальные разделы сайта работают.',
  });
  return <PublicPageShell activeTab={tabFromPath(pathname)} pathname={pathname} access={access} navigate={navigate} editorial>
    <section className="not-found-page not-found-page--unavailable" aria-labelledby="route-error-title" role="alert" data-app-error="route">
      <div className="not-found-page__icon" aria-hidden="true"><RefreshCw /></div>
      <p className="not-found-page__eyebrow">Ошибка загрузки</p>
      <h1 id="route-error-title">{recovery.heading}</h1>
      <p className="not-found-page__description">{recovery.text}</p>
      <div className="not-found-page__actions">
        <button className="not-found-page__primary" type="button" onClick={recovery.retry}>
          <RefreshCw aria-hidden="true" /> {recovery.action}
        </button>
        <a href="/"><Home aria-hidden="true" /> На главную</a>
      </div>
      {error.digest && <p className="not-found-page__description">Код ошибки: {error.digest}</p>}
    </section>
  </PublicPageShell>;
}
