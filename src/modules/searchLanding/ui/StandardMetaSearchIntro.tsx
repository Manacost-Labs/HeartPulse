import React from 'react';

/** The only H1 of the meta page: Wild has its own address and its own heading. */
export function StandardMetaSearchIntro({ format = 'standard' }: { format?: 'standard' | 'wild' }) {
  return (
    <div className="traditional-mode-banner__copy">
      <h1>{format === 'wild' ? 'Мета Вольного формата Hearthstone' : 'Мета Hearthstone: колоды и винрейты'}</h1>
    </div>
  );
}
