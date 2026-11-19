import React from 'react';
import './HomeBattlegrounds.css';

const BG_HOME_CARDS: Array<{
  id: 'bg-heroes' | 'bg-library' | 'bg-tier-list' | 'bg-strategies' | 'bg-tier-builder';
  href: string;
  title: string;
  desc: string;
}> = [
  { id: 'bg-heroes', href: '/heroes/', title: 'Герои', desc: 'Отдельные страницы героев, сила, способности и связки для текущей меты.' },
  { id: 'bg-library', href: '/library/', title: 'Библиотека', desc: 'Существа, заклинания, архив пула и быстрый поиск по картам Полей сражений.' },
  { id: 'bg-tier-list', href: '/battlegrounds/tier-list/', title: 'Тир-лист', desc: 'Сводка по сильным картам и стратегиям без ручного копания в таблицах.' },
  { id: 'bg-strategies', href: '/battlegrounds/strategies/', title: 'Стратегии', desc: 'Конструктор для сборки и визуализации планов партии.' },
  { id: 'bg-tier-builder', href: '/battlegrounds/tier-builder/', title: 'Свой тир-лист', desc: 'Инструмент для сборки собственных рядов и экспорта результата.' },
];

export default function HomeBattlegrounds({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <section aria-labelledby="home-bg-heading" className="home-bg-directory home-reveal">
      <div className="home-section-heading">
        <div className="home-bg-directory__sign">
          <span>Battlegrounds</span>
          <h2 id="home-bg-heading">Поля сражений</h2>
        </div>
      </div>
      <nav className="home-bg-directory__links" aria-label="Разделы Полей сражений">
        {BG_HOME_CARDS.map((card, index) => (
          <a
            key={card.id}
            href={card.href}
            onClick={(e: React.MouseEvent) => { e.preventDefault(); onNavigate(card.id); }}
            className="home-bg-directory__link"
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
