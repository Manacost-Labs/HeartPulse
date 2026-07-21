import { ArrowRight, Home, LibraryBig, SearchX } from 'lucide-react';
import type { MouseEvent } from 'react';

type NotFoundPageProps = {
  navigatePath: (path: string) => void;
};

export default function NotFoundPage({ navigatePath }: NotFoundPageProps) {
  const navigate = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigatePath(path);
  };

  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <div className="not-found-page__icon" aria-hidden="true"><SearchX /></div>
      <p className="not-found-page__eyebrow">Ошибка 404</p>
      <h1 id="not-found-title">Страница не найдена</h1>
      <p className="not-found-page__description">
        Возможно, адрес изменился или в ссылке есть опечатка. Вернитесь на главную
        либо продолжите поиск в открытых разделах Manacost Stats.
      </p>
      <div className="not-found-page__actions" aria-label="Куда перейти дальше">
        <a className="not-found-page__primary" href="/" onClick={event => navigate(event, '/')}>
          <Home aria-hidden="true" />
          На главную
          <ArrowRight aria-hidden="true" />
        </a>
        <a href="/articles" onClick={event => navigate(event, '/articles')}>Статьи</a>
        <a href="/standard/cards" onClick={event => navigate(event, '/standard/cards')}>
          <LibraryBig aria-hidden="true" />
          Карты
        </a>
      </div>
    </section>
  );
}
