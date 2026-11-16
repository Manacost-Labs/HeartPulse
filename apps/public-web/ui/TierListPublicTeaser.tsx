import './TierListPublicTeaser.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { PublicTierlistTeaser, PublicTierlistTeaserCard } from '@/apps/public-web/lib/publicTierlistTeaserData';
import { pluralRu } from '@/src/shared/text/pluralRu';

function CardList({ cards, withClass }: { cards: PublicTierlistTeaserCard[]; withClass: boolean }) {
  return <ol>
    {cards.map(card => <li key={card.cardId}>{`${card.name} — тир ${card.tier}${withClass ? `, ${card.className}` : ''}`}</li>)}
  </ol>;
}

/**
 * What a guest and a robot get on `/tierlist/` in the server HTML: the top ten
 * cards and the top three of each class, with tier, date and sample size and
 * no winrate. The same markup for everyone; the closed part of the page lives
 * in `.paywalled-tierlist` (see the page's JSON-LD). Nothing without a teaser.
 */
export function TierListPublicTeaser({ data }: { data: PublicTierlistTeaser | null }) {
  if (!data) return null;
  const date = seoDataDate(data.updatedAt, Date.now());
  const games = data.sampleGames;
  return <section className="tierlist-public-teaser" aria-labelledby="tierlist-public-teaser-title">
    <h2 id="tierlist-public-teaser-title">Лучшие карты Арены сейчас</h2>
    <p>
      {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
      {`${games ? ` · по ${games.toLocaleString('ru-RU')} ${pluralRu(games, 'игре', 'играм', 'играм')}` : ''}${data.source ? ` · источник ${data.source}` : ''}. Полный список карт, точные винрейты, фильтры и обновление в реальном времени — по подписке.`}
    </p>
    <h3>Топ-10 карт Арены</h3>
    <CardList cards={data.top} withClass />
    {data.classes.length ? <>
      <h3>Лучшие карты по классам</h3>
      <div className="tierlist-public-teaser__classes">
        {data.classes.map(entry => <div key={entry.id}>
          <h4>{entry.name}</h4>
          <CardList cards={entry.cards} withClass={false} />
        </div>)}
      </div>
    </> : null}
  </section>;
}
