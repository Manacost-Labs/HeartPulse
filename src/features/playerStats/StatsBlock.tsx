import type { ReactNode } from 'react';
import type { GlobalAvailability } from '../../modules/playerStats/public';

/**
 * One group of the statistics: a display heading, at most one line on how to
 * read it, and its content. Groups are divided by the paper line, not frames.
 */
export function StatsBlock({ title, note, aside, wide, children }: {
  title: string;
  note?: string;
  aside?: ReactNode;
  /** Takes the whole row of the two-column layout. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="player-stats-block" data-wide={wide || undefined}>
      <header className="player-stats-block__head">
        <div>
          <h3>{title}</h3>
          {note ? <p className="player-stats-block__note">{note}</p> : null}
        </div>
        {aside ? <div className="player-stats-block__aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

const SECTION_NAMES = { battlegrounds: 'Полей сражений', standard: 'Стандарта' } as const;

/** Why «в среднем» comparisons are missing: the paid section's subscription, or the source is down. */
export function GlobalNote({ availability, section }: { availability: GlobalAvailability; section: keyof typeof SECTION_NAMES }) {
  if (availability === 'available' || availability === 'none') return null;
  return (
    <p className="player-stats-note">
      {availability === 'subscription'
        ? <>Сравнение со всеми игроками открывает <a href="#account-access">подписка на разделы {SECTION_NAMES[section]}</a>.</>
        : 'Общая статистика сейчас недоступна, поэтому сравнения скрыты.'}
    </p>
  );
}
