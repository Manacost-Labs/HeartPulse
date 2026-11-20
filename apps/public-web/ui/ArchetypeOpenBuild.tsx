import type { ReactNode } from 'react';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { OpenArchetypeBuild } from '@/apps/public-web/lib/publicArchetypeTeaserData';
import { ArchetypeOpenBuildCopy } from './ArchetypeOpenBuildCopy';

const number = (value: number, digits: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits });

/**
 * One open build: winrate, games, date, the card list linked to the card
 * pages of the archetype's format, and the deck code. The server prints the
 * first page; «Загрузить ещё» renders the next ones with the same markup.
 */
export function ArchetypeOpenBuild({ build, title, format, now, facts }: {
  build: OpenArchetypeBuild; title: string; format: 'standard' | 'wild'; now: number;
  /** Extra facts of the deck (the fun decks' class, reasons and index), between the numbers and the card list. */
  facts?: ReactNode;
}) {
  const date = seoDataDate(build.updatedAt, now);
  return <article className="archetype-open-build">
    <h3>{title}</h3>
    <dl>
      <div><dt>Винрейт</dt><dd>{build.winrate === null ? '—' : `${number(build.winrate, 1)}%`}</dd></div>
      <div><dt>Игры</dt><dd>{build.games === null ? '—' : number(build.games, 0)}</dd></div>
      <div><dt>Данные на</dt><dd>{date ? <time dateTime={date.iso}>{date.date}</time> : '—'}</dd></div>
    </dl>
    {facts}
    {build.cards ? <ol className="archetype-open-build__cards" aria-label={`Карты: ${title}`}>
      {/* Card ids are checked by the page's allowlist (`[A-Za-z0-9_]`); only a card of the format's catalog has a page. */}
      {build.cards.map((card, index) => <li key={card.id ?? `unknown-${index}`} data-cost={card.cost ?? '?'}>
        <span>{card.hasPage && card.id ? <a href={`/standard/cards/${format}/${encodeURIComponent(card.id)}/`}>{card.name}</a>
          : card.name ?? 'Неизвестная карта'}{card.count > 1 ? ` ×${card.count}` : ''}</span>
      </li>)}
    </ol> : null}
    <code>{build.deckCode}</code>
    <ArchetypeOpenBuildCopy deckCode={build.deckCode} title={title} />
  </article>;
}
