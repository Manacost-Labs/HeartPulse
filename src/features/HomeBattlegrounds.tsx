import React from 'react';

const BG_HOME_CARDS: Array<{
  id: 'bg-heroes' | 'bg-library' | 'bg-tier-list' | 'bg-strategies' | 'bg-tier-builder';
  href: string;
  title: string;
  desc: string;
  stat: string;
}> = [
  { id: 'bg-heroes', href: '/heroes', title: 'Герои', desc: 'Отдельные страницы героев, сила, способности и связки для текущей меты.', stat: 'тиры героев' },
  { id: 'bg-library', href: '/library', title: 'Библиотека', desc: 'Существа, заклинания, архив пула и быстрый поиск по картам Полей Сражений.', stat: 'пул карт' },
  { id: 'bg-tier-list', href: '/battlegrounds/tier-list', title: 'Тир-лист', desc: 'Сводка по сильным картам и стратегиям без ручного копания в таблицах.', stat: 'мета' },
  { id: 'bg-strategies', href: '/battlegrounds/strategies', title: 'Стратегии', desc: 'Конструктор для сборки и визуализации планов партии.', stat: 'builder' },
  { id: 'bg-tier-builder', href: '/battlegrounds/tier-builder', title: 'Свой тир-лист', desc: 'Инструмент для сборки собственных рядов и экспорта результата.', stat: 'export' },
];

export default function HomeBattlegrounds({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <section aria-labelledby="home-bg-heading" className="home-bg-directory home-reveal">
      <div className="home-section-heading">
        <div className="home-bg-directory__sign">
          <span>Battlegrounds</span>
          <h2 id="home-bg-heading">Поля Сражений</h2>
        </div>
        <p>Герои, карты и инструменты для подготовки своей стратегии.</p>
      </div>
      <nav className="home-bg-directory__links" aria-label="Разделы Полей Сражений">
        {BG_HOME_CARDS.map((card, index) => (
          <a
            key={card.id}
            href={card.href}
            onClick={(e: React.MouseEvent) => { e.preventDefault(); onNavigate(card.id); }}
            className="home-bg-directory__link"
            data-featured={index < 2 ? 'true' : 'false'}
          >
            <span>
              <small>{card.stat === 'builder' ? 'конструктор' : card.stat === 'export' ? 'экспорт' : card.stat}</small>
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
