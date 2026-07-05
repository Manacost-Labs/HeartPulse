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
    <section aria-labelledby="home-bg-heading" className="home-bg-section hs-card rounded-2xl p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="home-bg-heading" className="font-hs text-[#1f3654] text-2xl sm:text-3xl m-0">Поля Сражений</h2>
          <p className="text-sm leading-relaxed mt-2 mb-0" style={{ color: '#52667f', maxWidth: 720 }}>
            Разделы для Battlegrounds: герои, библиотека существ и заклинаний, тир-листы и конструкторы для подготовки стратегий.
          </p>
        </div>
        <a
          href="/heroes"
          onClick={(e: React.MouseEvent) => { e.preventDefault(); onNavigate('bg-heroes'); }}
          className="modern-secondary-link self-start sm:self-auto"
          style={{ textDecoration: 'none' }}
        >
          Открыть героев
        </a>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mt-5">
        {BG_HOME_CARDS.map(card => (
          <a
            key={card.id}
            href={card.href}
            onClick={(e: React.MouseEvent) => { e.preventDefault(); onNavigate(card.id); }}
            className="home-bg-card group"
          >
            <span className="relative modern-mini-stat self-start mb-2">{card.stat}</span>
            <strong className="relative font-hs text-lg leading-tight">{card.title}</strong>
            <span className="relative text-xs leading-snug mt-1">{card.desc}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
