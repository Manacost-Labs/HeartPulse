'use client';
import { startTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Home, RefreshCw } from 'lucide-react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { tabFromPath } from '@/src/app/routing/routeManifest';
import { classifyAppError } from '@/src/components/appErrorRecovery';
import { usePublicAccess } from '@/apps/public-web/ui/usePublicAccess';
import { navigate } from '@/apps/public-web/ui/navigation';
import '@/src/features/NotFoundPage.css';

// Every route without its own error.tsx lands here, so the copy names no
// section. A tab opened before a deploy cannot load the removed chunks; only
// a full reload recovers it, while a data error retries the server render.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const access = usePublicAccess();
  const outdated = classifyAppError(error) === 'chunk';
  const retry = () => {
    if (outdated) window.location.reload();
    else startTransition(() => { router.refresh(); reset(); });
  };
  return <PublicPageShell activeTab={tabFromPath(pathname)} pathname={pathname} access={access} navigate={navigate} editorial>
    <section className="not-found-page not-found-page--unavailable" aria-labelledby="route-error-title" role="alert">
      <div className="not-found-page__icon" aria-hidden="true"><RefreshCw /></div>
      <p className="not-found-page__eyebrow">Ошибка загрузки</p>
      <h1 id="route-error-title">{outdated ? 'Сайт обновился' : 'Страница временно недоступна'}</h1>
      <p className="not-found-page__description">{outdated
        ? 'Вышла новая версия сайта. Обновите страницу, чтобы продолжить.'
        : 'Не удалось загрузить данные. Попробуйте ещё раз через минуту — остальные разделы сайта работают.'}</p>
      <div className="not-found-page__actions">
        <button className="not-found-page__primary" type="button" onClick={retry}>
          <RefreshCw aria-hidden="true" /> {outdated ? 'Обновить страницу' : 'Повторить'}
        </button>
        <a href="/"><Home aria-hidden="true" /> На главную</a>
      </div>
      {error.digest && <p className="not-found-page__description">Код ошибки: {error.digest}</p>}
    </section>
  </PublicPageShell>;
}
