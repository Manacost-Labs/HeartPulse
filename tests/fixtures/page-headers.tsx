import React from 'react';
import { createRoot } from 'react-dom/client';
import { SectionBanner } from '../../src/features/EditorialRouteChrome';
import { StandardMetaSearchIntro } from '../../src/modules/searchLanding/ui/StandardMetaSearchIntro';
import '../../src/index.css';
import '../../src/route-parchment.css';
import '../../src/features/StandardMeta.css';
import '../../src/features/FunDecksPage.css';
import '../../src/features/ConstructedArchetypes.css';
import '../../src/features/StandardMatchups.css';
import '../../src/features/ViciousSyndicateGold.css';
import '../../src/features/StandardCards.css';

export const headers = [
  ['standard-meta', 'standard-meta', 'HSGuru: мета Hearthstone', ''],
  ['fun-decks', 'fun-decks-page', 'Фан-колоды', 'Необычные сборки Стандарта и Вольного режима для новых впечатлений от игры.'],
  ['constructed-archetypes', 'archetypes-page', 'Архетипы', 'Каталог архетипов Стандарта и Вольного режима.'],
  ['standard-matchups', 'standard-matchups', 'Матчапы', 'Сравнивайте колоды и выбирайте подходящие матчапы.'],
  ['standard-vicious-gold', 'vsgold', 'Vicious Syndicate Gold', 'Подробная статистика колод и классов текущей меты.'],
  ['standard-cards', 'constructed-cards', 'Карты', ''],
  ['winrates', '', 'Классы', 'Статистика побед на Арене — текущий патч'],
  ['tierlist', '', 'Тир-лист карт Арены Hearthstone', 'Оценки карт для каждого класса — текущий патч'],
  ['legendaries', '', 'Легендарки', 'Наборы карт для выбора первой легендарки на Арене'],
];

export function HeaderFixture({ index = 0 }: { index?: number }) {
  const [route, container, title, subtitle] = headers[index];
  const summary = <dl className="traditional-mode-banner__summary" aria-label="Сводка"><div><dt>Архетипов</dt><dd>42</dd></div><div><dt>Игр в выборке</dt><dd>1 234 567</dd></div></dl>;
  return <div className={`arena-app-shell arena-app-game-data arena-app-${route}`}>
    <div className="arena-workspace arena-workspace-with-tools"><main className="arena-main"><div className="arena-content arena-content-open"><div className={container}>
      {index >= 6 ? <SectionBanner title={title} subtitle={subtitle} /> : index === 5 ? <header className="constructed-cards__header"><div><h1>{title}</h1><div className="constructed-cards__beta"><span>Бета</span><span>Статистика Алмаз · подписка Алмаз</span></div></div><p>Алмаз · <strong>Текущий патч</strong></p></header> : <header className="traditional-mode-banner">
        {index === 0 ? <StandardMetaSearchIntro /> : <div className="traditional-mode-banner__copy"><h1>{title}</h1><p>{subtitle}</p>{index === 1 && <p className="fun-decks-freshness">Обновлено 20 сентября 2026</p>}</div>}
        {summary}
      </header>}
      <section data-header-content className={[
        'standard-meta__controls', 'fun-decks-method', 'archetypes-format-switch',
        'standard-matchups__mode-toolbar', 'vsgold__distribution-grid',
        'constructed-cards__controls', '', '', '',
      ][index]} aria-label="Контент раздела"><p>Фильтры и содержимое раздела</p></section>
    </div></div></main></div>
  </div>;
}

if (document.getElementById('header-fixture')) {
  createRoot(document.getElementById('header-fixture')!).render(<HeaderFixture index={Number(new URLSearchParams(location.search).get('case') || 0)} />);
}
