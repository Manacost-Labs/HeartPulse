import { SectionBanner } from '../shared/ui/EditorialRouteChrome';
import { ArrowRight, Home, LibraryBig, RefreshCw, SearchX } from 'lucide-react';
import type { MouseEvent } from 'react';

type NotFoundPageProps = {
  navigatePath: (path: string) => void;
  state?: 'not-found' | 'unavailable';
};

export default function NotFoundPage({ navigatePath, state = 'not-found' }: NotFoundPageProps) {
  const navigate = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigatePath(path);
  };

  if (state === 'unavailable') {
    return (
      <>
        <SectionBanner title="Не удалось открыть страницу" titleId="route-unavailable-title" />
        <section className="not-found-page not-found-page--unavailable" aria-labelledby="route-unavailable-title" role="alert">
          <div className="not-found-page__icon" aria-hidden="true"><RefreshCw /></div>
          <p className="not-found-page__eyebrow">Ошибка загрузки</p>
          <p className="not-found-page__description">Обновите страницу, чтобы повторно загрузить таблицу маршрутов.</p>
          <div className="not-found-page__actions">
            <button className="not-found-page__primary" type="button" onClick={() => window.location.reload()}>
              <RefreshCw aria-hidden="true" /> Обновить страницу
            </button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <SectionBanner title="Страница не найдена" titleId="not-found-title" />
      <section className="not-found-page" aria-labelledby="not-found-title">
        <div className="not-found-page__icon" aria-hidden="true"><SearchX /></div>
        <p className="not-found-page__eyebrow">Ошибка 404</p>
        <p className="not-found-page__description">
          Возможно, адрес изменился или в ссылке есть опечатка. Вернитесь на главную
          либо продолжите поиск в открытых разделах HearthPulse.
        </p>
        <div className="not-found-page__actions" aria-label="Куда перейти дальше">
          <a className="not-found-page__primary" href="/" onClick={event => navigate(event, '/')}>
            <Home aria-hidden="true" />
            На главную
            <ArrowRight aria-hidden="true" />
          </a>
          <a href="/articles/" onClick={event => navigate(event, '/articles/')}>Статьи</a>
          <a href="/standard/cards/" onClick={event => navigate(event, '/standard/cards/')}>
            <LibraryBig aria-hidden="true" />
            Карты
          </a>
        </div>
      </section>
      </>
  );
}
