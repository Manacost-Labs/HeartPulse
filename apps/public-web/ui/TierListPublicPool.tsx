import './TierListPublicPool.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { PublicTierlist } from '@/apps/public-web/lib/publicTierlistData';
import { TierListClassTables } from './TierListClassTables';

const percent = (value: number | null) => value === null ? '—' : value.toFixed(1).replace('.', ',');
const cell = (value: string) => value.replace(/[\t\n\r]+/g, ' ');

/**
 * What a guest and a robot get on `/tierlist/` in the server HTML: the whole
 * card pool by class with tier, base winrate (0,1) and pick rate, the date and
 * the source. The same markup for everyone; the closed part (other metrics,
 * narrow filters, history) lives in `.paywalled-tierlist` (see the page's
 * JSON-LD). Nothing without data.
 */
export function TierListPublicPool({ data }: { data: PublicTierlist | null }) {
  if (!data) return null;
  const date = seoDataDate(data.updatedAt, Date.now());
  const games = data.sampleGamesAtLeast;
  return <section id="tierlist-pool" className="tierlist-public-pool" aria-labelledby="tierlist-public-pool-title">
    <h2 id="tierlist-public-pool-title">Тир-лист карт Арены по классам</h2>
    <p>
      {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
      {`${games ? ` · по данным более ${games.toLocaleString('ru-RU')} игр` : ''}${data.source ? ` · источник ${data.source}` : ''}. Тир, винрейт и частота выбора каждой карты. Остальные показатели, узкие фильтры и история — по подписке.`}
    </p>
    <TierListClassTables classes={data.classes.map(entry => ({
      id: entry.id, name: entry.name,
      rows: entry.cards.map(card => `${cell(card.name)}\t${card.tier === 'U' ? '—' : card.tier}\t${percent(card.winrate)}\t${percent(card.pickRate)}`).join('\n'),
    }))} />
  </section>;
}
