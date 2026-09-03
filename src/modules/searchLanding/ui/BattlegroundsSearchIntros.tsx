import React from 'react';

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
