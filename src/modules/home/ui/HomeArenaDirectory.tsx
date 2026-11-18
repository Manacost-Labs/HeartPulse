import React from 'react';
import './HomeArenaDirectory.css';

const ARENA_HOME_CARDS: Array<{
  id: 'winrates' | 'tierlist' | 'legendaries' | 'articles' | 'guides-archive';
  href: string;
  title: string;
  desc: string;
}> = [
  { id: 'winrates', href: '/classes/', title: 'Классы', desc: 'Текущие винрейты всех классов и лидер меты перед началом драфта.' },
  { id: 'tierlist', href: '/tierlist/', title: 'Тир-лист карт', desc: 'Оценки карт от S до F для быстрых решений во время каждого выбора.' },
  { id: 'legendaries', href: '/legendaries/', title: 'Легендарки', desc: 'Сравнение легендарных групп по реальному винрейту.' },
  { id: 'articles', href: '/articles/', title: 'Мета-отчёты', desc: 'Разборы патчей, классов и актуальных стратегий Арены.' },
  { id: 'guides-archive', href: '/guides-archive/', title: 'Архив гайдов', desc: 'Сохранённые материалы и полезные руководства Manacost.' },
];

export default function HomeArenaDirectory({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <section aria-labelledby="home-arena-directory-heading" className="home-arena-directory home-reveal">
      <div className="home-section-heading">
        <div className="home-arena-directory__sign">
          <span>Hearthstone</span>
          <h2 id="home-arena-directory-heading">Арена</h2>
        </div>
      </div>
      <nav className="home-arena-directory__links" aria-label="Разделы Арены">
        {ARENA_HOME_CARDS.map((card, index) => (
          <a
            key={card.id}
            href={card.href}
            onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate(card.id); }}
            className="home-arena-directory__link"
            data-featured={index < 2 ? 'true' : 'false'}
          >
            <span>
              <strong>{card.title}</strong>
              <span>{card.desc}</span>
            </span>
            <b aria-hidden="true">↗</b>
          </a>
        ))}
      </nav>
    </section>
  );
}
