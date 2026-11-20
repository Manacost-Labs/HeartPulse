import type { ReactNode } from 'react';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { hsguruSourceUrl } from '@/apps/public-web/lib/seoDataSource';
import type { PublicBattlegroundHeroesRanking } from '@/apps/public-web/lib/publicBattlegroundHeroesData';
import type { PublicClassesTeaser } from '@/apps/public-web/lib/publicClassesTeaserData';
import type { PublicTierlist } from '@/apps/public-web/lib/publicTierlistData';
import { INDEXABLE_ARCHETYPE_MIN_GAMES } from '@/shared/constructedArchetypeIndexing';
import type { ArchetypeCatalog } from '@/src/features/ConstructedArchetypes';
import type { StandardMetaTeaserSeed } from '@/src/features/standardMetaTeaser';

// The «Сейчас в режиме» blocks of the mode hubs: a few rows of the open layer a
// guest already gets on the source page, with its date and source. Only the
// fields that page shows in its server HTML are read here; a hub without data
// renders no block (no placeholder, no invented date).

const TOP = 5;
const decimal = (value: number, digits = 1) => value.toFixed(digits).replace('.', ',');
const percent = (value: number | null) => value === null ? null : `${decimal(value)}%`;
const count = (value: number) => value.toLocaleString('ru-RU');
const joined = (parts: (string | null)[]) => parts.filter(Boolean).join(', ');

function DataNote({ updatedAt, source }: { updatedAt: string | null | undefined; source: string }) {
  const date = seoDataDate(updatedAt, Date.now());
  return <p className="mode-hub__note">
    {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
    {source ? ` · источник ${source}` : ''}
  </p>;
}

function NowList({ caption, children }: { caption: string; children: ReactNode }) {
  return <>
    <h3>{caption}</h3>
    <ol className="mode-hub__rows">{children}</ol>
  </>;
}

type Archetype = { slug: string; label: string; winrate: number | null; popularity: number | null; games: number | null };

/** The most played archetypes first, the sample breaking ties. */
const mostPlayed = (rows: Archetype[]) => [...rows]
  .sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1) || (b.games ?? 0) - (a.games ?? 0))
  .slice(0, TOP);

function archetypeFacts(row: Archetype): string {
  return joined([
    row.winrate === null ? null : `винрейт ${percent(row.winrate)}`,
    row.popularity === null ? null : `популярность ${percent(row.popularity)}`,
    row.games === null ? null : `${count(row.games)} игр`,
  ]);
}

/** Standard: the most played archetypes of the open meta slice; a strong one links to its own page. */
export function StandardNow({ seed }: { seed: StandardMetaTeaserSeed | null }) {
  if (!seed) return null;
  const { data } = seed;
  const rows = mostPlayed(data.items.map(item => ({
    slug: item.slug, label: item.archetypeLabel || item.archetype,
    winrate: item.winrate, popularity: item.popularity, games: item.games,
  })));
  return <>
    <DataNote updatedAt={data.updatedAt} source={hsguruSourceUrl(data.sourceUrl) ? 'HSGuru' : ''} />
    <NowList caption={`Самые популярные архетипы: ${data.rankLabel}`}>
      {rows.map(row => <li key={row.slug}>
        {row.slug && (row.games ?? 0) >= INDEXABLE_ARCHETYPE_MIN_GAMES
          ? <a href={`/standard/archetypes/standard/${row.slug}/`}>{row.label}</a> : row.label}
        {` — ${archetypeFacts(row)}`}
      </li>)}
    </NowList>
  </>;
}

/** Wild: the most played archetypes of the open Wild catalog. Their pages are noindex, so they are not linked. */
export function WildNow({ catalog }: { catalog: ArchetypeCatalog | null }) {
  if (!catalog || catalog.items.length === 0) return null;
  const rows = mostPlayed(catalog.items.map(item => ({
    slug: item.slug, label: item.archetypeLabel || item.archetype,
    winrate: item.winrate, popularity: item.popularity, games: item.games,
  })));
  return <>
    <DataNote updatedAt={catalog.updatedAt} source={hsguruSourceUrl(catalog.items[0]?.sourceUrl) ? 'HSGuru' : ''} />
    <NowList caption="Самые популярные архетипы Вольного">
      {rows.map(row => <li key={row.slug}>{`${row.label} — ${archetypeFacts(row)}`}</li>)}
    </NowList>
  </>;
}

/** The pool's best cards by winrate, one row per card (a neutral card keeps the class where it did best). */
function bestCards(tierlist: PublicTierlist) {
  const best = new Map<string, { cardId: string; name: string; className: string; tier: string; winrate: number }>();
  for (const entry of tierlist.classes) {
    for (const card of entry.cards) {
      if (card.winrate === null || (best.get(card.cardId)?.winrate ?? -1) >= card.winrate) continue;
      best.set(card.cardId, { cardId: card.cardId, name: card.name, className: entry.name, tier: card.tier, winrate: card.winrate });
    }
  }
  return [...best.values()].sort((a, b) => b.winrate - a.winrate).slice(0, TOP);
}

/** Arena: the order of the classes and the best cards of the open tier list. */
export function ArenaNow({ classes, tierlist }: { classes: PublicClassesTeaser | null; tierlist: PublicTierlist | null }) {
  const cards = tierlist ? bestCards(tierlist) : [];
  if (!classes && cards.length === 0) return null;
  const unit = classes?.sampleUnit === 'drafts' ? 'забегов' : classes?.sampleUnit === 'games' ? 'игр' : null;
  return <>
    {classes ? <>
      <DataNote updatedAt={classes.updatedAt} source={classes.source} />
      <NowList caption="Классы по проценту побед">
        {classes.classes.map(item => <li key={item.id}>
          {`${item.name} — ${joined([percent(item.winrate), item.sample !== null && unit ? `${count(item.sample)} ${unit}` : null])}`}
        </li>)}
      </NowList>
    </> : null}
    {tierlist && cards.length ? <>
      <DataNote updatedAt={tierlist.updatedAt} source={tierlist.source} />
      <NowList caption="Карты с самым высоким винрейтом">
        {cards.map(card => <li key={card.cardId}>
          {`${card.name} (${card.className}) — тир ${card.tier}, винрейт ${percent(card.winrate)}`}
        </li>)}
      </NowList>
    </> : null}
  </>;
}

/** Battlegrounds: the head of the open hero ranking (solo, or duos when solo has no data), linked to the hero pages. */
export function BattlegroundsNow({ solo, duos }: {
  solo: PublicBattlegroundHeroesRanking | null; duos: PublicBattlegroundHeroesRanking | null;
}) {
  const ranking = solo ?? duos;
  if (!ranking) return null;
  return <>
    <DataNote updatedAt={ranking.updatedAt} source={ranking.source} />
    <NowList caption={`Лучшие герои: ${ranking.mode === 'solo' ? 'одиночная игра' : 'Дуо'}, рейтинг «Топ 50%»`}>
      {ranking.heroes.slice(0, TOP).map(hero => <li key={hero.dbfId}>
        <a href={`/heroes/${hero.dbfId}/`}>{hero.name}</a>
        {` — ${joined([`тир ${hero.tier}`, `среднее место ${decimal(hero.avgPlacement, 2)}`,
          hero.top4Rate === null ? null : `топ-4 ${percent(hero.top4Rate)}`])}`}
      </li>)}
    </NowList>
  </>;
}
