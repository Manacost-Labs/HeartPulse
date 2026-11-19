import './BattlegroundLibraryPublic.css';
import { LibraryListingTable } from './BattlegroundLibraryListingTable';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { PublicLibraryListing, PublicLibraryListingItem } from '@/apps/public-web/lib/publicBattlegroundLibraryListingData';

const number = (value: number, digits: number) => value.toFixed(digits).replace('.', ',');
const dash = '—';

function groups(items: PublicLibraryListingItem[]) {
  const byTier = new Map<number | null, PublicLibraryListingItem[]>();
  for (const item of items) byTier.set(item.tavernTier, [...(byTier.get(item.tavernTier) ?? []), item]);
  return [...byTier.entries()].sort(([left], [right]) => (left ?? 99) - (right ?? 99));
}

const cell = (value: string) => value.replace(/[\t\n]+/g, ' ');

/** One line per card: the name, the path and the cells of the table, in the order of its columns. */
function rowOf(item: PublicLibraryListingItem, columns: { group: boolean; body: boolean; stats: boolean }): string {
  return [item.name, item.path,
    ...(columns.group ? [item.group ?? dash] : []),
    ...(columns.body ? [item.attack !== null && item.health !== null ? `${item.attack}/${item.health}` : dash] : []),
    ...(columns.stats ? [item.stats ? number(item.stats.avgPlacementWith, 2) : dash,
      item.stats?.popularity != null ? `${number(item.stats.popularity, 1)}%` : dash] : []),
  ].map(cell).join('\t');
}

/**
 * What a guest and a robot get on `/library/<kind>/` in the server HTML: every card of the current pool grouped by
 * tavern tier, with name, link, tribe, attack and health and, for minions, the base statistics («Топ 50%»: average
 * place and popularity). The same markup for everyone; the closed part (filters, comparison, strength by round,
 * positions, history) lives in `.paywalled-library` (see the page's JSON-LD).
 */
export function BattlegroundLibraryPublicListing({ listing, groupLabel }: { listing: PublicLibraryListing; groupLabel: string }) {
  const date = listing.updatedAt ? seoDataDate(listing.updatedAt, Date.now()) : null;
  const withStats = listing.items.some(item => item.stats !== null);
  const withBody = listing.items.some(item => item.attack !== null && item.health !== null);
  const withGroup = listing.items.some(item => item.group !== null);
  const tiers = groups(listing.items);
  const tiered = tiers.length > 1 || tiers[0]?.[0] !== null;
  return <div className="bg-library-public">
    {tiered ? <nav aria-label="Уровни таверны"><ul className="bg-library-public__tiers">
      {tiers.map(([tier]) => <li key={tier ?? 'none'}><a href={`#tier-${tier ?? 'none'}`}>{tier === null ? 'Без уровня' : `Таверна ${tier}`}</a></li>)}
    </ul></nav> : null}
    {withStats ? <p>
      {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
      {' · источник HSReplay · рейтинг «Топ 50%», текущий патч.'}
    </p> : null}
    {tiers.map(([tier, items]) => {
      const title = tiered ? (tier === null ? 'Без уровня' : `Таверна ${tier}`) : groupLabel;
      return <section key={tier ?? 'none'} id={`tier-${tier ?? 'none'}`} aria-labelledby={`tier-${tier ?? 'none'}-title`}>
        <h2 id={`tier-${tier ?? 'none'}-title`}>{title}</h2>
        <LibraryListingTable caption={title}
          headers={['Карта', ...(withGroup ? ['Тип'] : []), ...(withBody ? ['Атака/здоровье'] : []), ...(withStats ? ['Среднее место', 'Популярность'] : [])]}
          rows={items.map(item => rowOf(item, { group: withGroup, body: withBody, stats: withStats })).join('\n')} />
      </section>;
    })}
  </div>;
}
