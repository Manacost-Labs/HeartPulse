import './TierListPublicPool.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { PublicTierlist } from '@/apps/public-web/lib/publicTierlistData';
import { TierListClassTables } from './TierListClassTables';

const percent = (value: number | null) => value === null ? '—' : value.toFixed(1).replace('.', ',');
const cell = (value: string) => value.replace(/[\t\n\r]+/g, ' ');
const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'U'];

/** The cards of a class grouped by tier, best tier first; the order inside a tier is the projection's. */
const tiersOf = (cards: PublicTierlist['classes'][number]['cards']) => TIER_ORDER
  .map(tier => ({ tier, rows: cards.filter(card => card.tier === tier)
    .map(card => `${cell(card.name)}\t${percent(card.winrate)}\t${percent(card.pickRate)}`).join('\n') }))
  .filter(group => group.rows);

/**
 * What a guest and a robot get on `/tierlist/` in the server HTML, as the
 * page's main content: the whole card pool by class and tier with the base
 * winrate (0,1) and the pick rate, the date and the source. The same markup
 * for everyone; the closed part (other metrics, narrow filters, history) is
 * shown as locks and named by the page's JSON-LD (`.paywalled-tierlist`).
 * Nothing without data.
 */
export function TierListPublicPool({ data }: { data: PublicTierlist | null }) {
  if (!data) return null;
  const date = seoDataDate(data.updatedAt, Date.now());
  const games = data.sampleGamesAtLeast;
  return <section id="tierlist-pool" className="tierlist-public-pool" aria-labelledby="tierlist-public-pool-title">
    <h2 id="tierlist-public-pool-title" className="sr-only">Тир-лист карт Арены по классам</h2>
    <p className="tierlist-public-pool__meta">
      {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
      {`${games ? ` · по данным более ${games.toLocaleString('ru-RU')} игр` : ''}${data.source ? ` · источник ${data.source}` : ''}`}
    </p>
    <TierListClassTables classes={data.classes.map(entry => ({ id: entry.id, name: entry.name, tiers: tiersOf(entry.cards) }))} />
  </section>;
}
