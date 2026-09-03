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
