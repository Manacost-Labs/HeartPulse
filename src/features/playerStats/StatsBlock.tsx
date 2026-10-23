import type { ReactNode } from 'react';
import type { GlobalAvailability } from '../../modules/playerStats/public';

/** One group inside the statistics section: a display heading and its content, divided by the paper line. */
export function StatsBlock({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="player-stats-block">
      <header className="player-stats-block__head">
        <h3>{title}</h3>
        {aside ? <div className="player-stats-block__aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

const SECTION_NAMES = { battlegrounds: 'Полей сражений', standard: 'Стандарта', arena: 'Арены' } as const;

/** Why «в среднем» columns are missing: the paid section's subscription, or the source is down. */
export function GlobalNote({ availability, section }: { availability: GlobalAvailability; section: keyof typeof SECTION_NAMES }) {
  if (availability === 'available') return null;
  return (
    <p className="player-stats-note">
      {availability === 'subscription'
        ? <>Сравнение со всеми игроками открывает <a href="#account-access">подписка на разделы {SECTION_NAMES[section]}</a>.</>
        : 'Общая статистика сейчас недоступна, поэтому сравнения скрыты.'}
    </p>
  );
}
