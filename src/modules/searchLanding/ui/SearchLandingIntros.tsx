import React from 'react';

export function ArenaTierListSearchIntro() {
  return (
    <section aria-label="Описание раздела">
      <p
        className="mb-5 px-1 text-sm leading-relaxed text-[#6b4c2a]"
        style={{ borderLeft: '3px solid #c4a46a', paddingLeft: '12px' }}
      >
        Тир-лист карт Арены Hearthstone — рейтинг всех карт по классам с оценками от S (авто-пик) до F (не брать).
        Выберите класс, чтобы увидеть лучшие карты для текущего патча. Данные обновляются автоматически на основе
        HSReplay, HearthArena и Firestone.
      </p>
      <nav className="mb-5 flex flex-wrap gap-x-4 gap-y-2 px-1 text-sm" aria-label="Связанные разделы Арены">
        <a className="font-semibold text-[#7b151b] underline underline-offset-4" href="/classes">Винрейты классов Арены</a>
        <a className="font-semibold text-[#7b151b] underline underline-offset-4" href="/legendaries">Легендарные карты Арены</a>
        <a className="font-semibold text-[#7b151b] underline underline-offset-4" href="/">Статистика Арены Hearthstone</a>
      </nav>
    </section>
  );
}

export function BattlegroundsTierListSearchIntro() {
  return (
    <div className="text-center">
      <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8b6c42]">Поля сражений</p>
      <h1 className="mt-2 font-hs text-3xl text-[#3d2a1e] sm:text-4xl">Тир-лист БГ Hearthstone</h1>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-[#6b4c2a]">
        Сравнивайте существ, стратегии, заклинания и аксессуары Полей сражений. Для тир-листа стратегий БГ
        откройте вкладку «Стратегии»; источник и время обновления указаны рядом с данными.
      </p>
      <nav className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm" aria-label="Связанные разделы Полей сражений">
        <a className="font-semibold text-[#75451f] underline underline-offset-4" href="/battlegrounds/strategies">Конструктор стратегий БГ</a>
        <a className="font-semibold text-[#75451f] underline underline-offset-4" href="/library">Библиотека Полей сражений</a>
        <a className="font-semibold text-[#75451f] underline underline-offset-4" href="/heroes">Герои БГ</a>
      </nav>
    </div>
  );
}

export function BattlegroundsStrategyBuilderSearchIntro() {
  return (
    <header className="mb-4 rounded-lg border border-[#6b4c2a]/40 bg-[#f4e3b9] px-4 py-4 text-center text-[#3d2a1e] shadow-sm">
      <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8b6c42]">Поля сражений</p>
      <h1 className="mt-2 font-hs text-3xl sm:text-4xl">Конструктор стратегий БГ Hearthstone</h1>
      <p className="mx-auto mt-2 max-w-3xl text-sm text-[#6b4c2a]">
        Соберите собственный план из существ, заклинаний и аксессуаров. Конструктор не ранжирует стратегии:
        готовые направления игры сравниваются в отдельном тир-листе.
      </p>
      <nav className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm" aria-label="Связанные инструменты Полей сражений">
        <a className="font-semibold text-[#75451f] underline underline-offset-4" href="/battlegrounds/tier-list">Тир-лист стратегий БГ</a>
        <a className="font-semibold text-[#75451f] underline underline-offset-4" href="/library">Библиотека Полей сражений</a>
        <a className="font-semibold text-[#75451f] underline underline-offset-4" href="/heroes">Герои БГ</a>
      </nav>
    </header>
  );
}

export function StandardMetaSearchIntro() {
  return (
    <div className="traditional-mode-banner__copy">
      <h1>Мета Hearthstone по данным HSGuru</h1>
      <p>HSGuru — источник статистики: сравнивайте тир-лист колод, винрейты и популярность актуальных архетипов.</p>
    </div>
  );
}

export function StandardMetaRelatedLinks() {
  return (
    <nav className="standard-meta__related flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Связанные разделы меты Hearthstone">
      <a className="font-semibold underline underline-offset-4" href="/standard/archetypes">Архетипы и колоды Hearthstone</a>
      <a className="font-semibold underline underline-offset-4" href="/standard/matchups">Матчапы по данным HSGuru</a>
      <a className="font-semibold underline underline-offset-4" href="/standard/cards">Карты Hearthstone</a>
    </nav>
  );
}
