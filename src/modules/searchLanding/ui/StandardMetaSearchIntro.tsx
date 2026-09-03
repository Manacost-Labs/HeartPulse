import React from 'react';

export function StandardMetaSearchIntro() {
  return (
    <div className="traditional-mode-banner__copy">
      <h1>HSGuru: мета Hearthstone</h1>
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
